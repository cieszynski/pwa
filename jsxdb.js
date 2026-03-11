// MIT License

// Copyright (c) 2026 Stephan Cieszynski

class Store {

    #store;

    constructor(store) {
        this.#store = store;
    }

    get autoincrement () { return this.#store.autoIncrement; }

    get indexnames() { return Array.from(this.#store.indexNames); }

    get keypath() { return this.#store.keyPath; }

    get name() { return this.#store.name; }

    #execute = (verb, ...args) => new Promise(async (resolve, reject) => {
        this.#store.transaction.onerror = (event) => reject(event.target.error);
        this.#store[verb](...args).onsuccess = (event) => resolve(event.target.result);
    });

    abort = () => this.#store.transaction.abort();

    add = (obj, key) => this.#execute('add', obj, key);

    clear = () => this.#execute('clear');

    commit = () => this.#store.transaction.commit();

    count = (keyOrKeyRange) => this.#execute('count', keyOrKeyRange);

    delete = (keyOrKeyRange) => this.#execute('delete', keyOrKeyRange);

    get = (keyOrKeyRange) => this.#execute('get', keyOrKeyRange);

    getAll = (keyRange, limit) => this.#execute('getAll', keyRange, limit);

    getAllKeys = (keyRange, limit) => this.#execute('getAllKeys', keyRange, limit);

    getKey = (keyOrKeyRange) => this.#execute('getKey', keyOrKeyRange);

    put = (obj, key) => this.#execute('put', obj, key);
}

const printf = (str, ...args) => args.reduce((a, b) => a.replace('%s', b), str);

class NotFoundError extends DOMException {

    constructor(message, ...args) {

        super(printf(message, ...args), 'NotFoundError');
    }
}

class Database {

    #db;

    constructor(db) {

        this.#db = db;
    }

    get name() { return this.#db.name; }

    get storenames() { return Array.from(this.#db.objectStoreNames); }

    get version() { return this.#db.version; }

    #readwrite = (ro = false, ...storeNames) => new Promise(async (resolve, reject) => {

        const missed = storeNames.filter(name => !this.#db.objectStoreNames.contains(name));
        const error = `
            Failed to execute 'transaction' on '%s':
            '%s' of the specified object stores was not found.`;

        if (missed.length) {
            reject(new NotFoundError(error, this.#db.name, missed.join(',')));

        } else {
            const request = this.#db.transaction(storeNames, ro ? 'readonly' : 'readwrite');

            resolve(storeNames.map(storeName => {
                return new Store(request.objectStore(storeName));
            }));
        }
    });

    read = (...storeNames) => this.#readwrite(true, ...storeNames);

    write = (...storeNames) => this.#readwrite(false, ...storeNames);

    close = () => this.#db.close();
}

const onupgradeneeded = (db, oldVersion, newVersion, scheme) => {

    for (let version = oldVersion + 1; version <= newVersion; version++) {

        Object.entries(scheme[version]).forEach(([storeName, definition]) => {

            const [keypath, ...indexes] = definition.split(/\s*(?:,)\s*/);

            // helper function to handle the different
            // types of keypaths in stores and indexes
            const prepareKeyPath = (keypath) => {
                return keypath
                    .replace(/[\*\!\@]/, '')
                    .split(/\+/)
                    // at this point keypath is an array
                    .reduce((prev, cur, idx) => {
                        switch (idx) {
                            case 0:
                                // keypath is keyPath:
                                return cur;
                            case 1:
                                // keypath is compound key
                                return [prev, cur];
                            default:
                                return [...prev, cur];
                        }
                    });
            }

            const store = db.createObjectStore(storeName, {
                // if keyPath.length is 0 set keyPath
                // to undefined (out-of-line keys)
                keyPath: prepareKeyPath(keypath) || undefined,
                autoIncrement: /^[\@]/.test(keypath)
            });

            indexes.forEach(indexName => {

                store.createIndex(
                    indexName.replace(/[\*!]/, ''),
                    prepareKeyPath(indexName),
                    {
                        multiEntry: /^\*/.test(indexName),
                        unique: /^\!/.test(indexName)
                    });

                console.debug("index '%s' created", indexName);
            }); // indexes.forEach
        }); // Object.entries(scheme[v])
    } // for loop
}

const JSxdb = new class {

    get databases() { return indexedDB.databases(); }

    init = (name, scheme) => new Promise((resolve, reject) => {

        const ordered = Object.keys(scheme).sort((a, b) => parseFloat(a) - parseFloat(b));

        try {
            // open the latest version or start an upgrade
            const request = indexedDB.open(name, ordered.at(-1));

            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(request.error);
            request.onsuccess = () => resolve(new Database(request.result));
            request.onupgradeneeded = (event) => onupgradeneeded(
                event.target.result,
                event.oldVersion,
                event.newVersion,
                scheme
            );

        } catch (ex) {
            switch (ex.name) {
                case 'TypeError':
                    reject(ex);
                    break;
                default:
                    reject('unknown error');
            }
        }

    });

    open = (name) => new Promise(async (resolve, reject) => {

        if (!(await JSxdb.databases).some(db => db.name === name)) {
            reject(`db "${name}" not found`);
        } else {

            try {
                const request = indexedDB.open(name);
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(request.error);
                request.onsuccess = () => resolve(new Database(request.result));

            } catch (ex) {
                switch (ex.name) {
                    case 'TypeError':
                        reject(ex.message);
                        break;
                    default:
                        reject('unknown error');
                }
            }
        }
    });
};

export { JSxdb }