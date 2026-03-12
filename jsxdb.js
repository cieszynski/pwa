// MIT License

// Copyright (c) 2026 Stephan Cieszynski

class Store {

    #store;

    constructor(store) {
        this.#store = store;
    }

    get autoincrement() { return this.#store.autoIncrement; }

    get indexnames() { return Array.from(this.#store.indexNames); }

    get keypath() { return this.#store.keyPath; }

    get name() { return this.#store.name; }

    // called from execute_and, execute_or
    #execute_cursor_query = (cursor) => Promise.resolve(cursor.value);

    // called from execute_and, execute_or
    #execute_cursor_update = (cursor, payload) => new Promise((resolve) => {
        cursor
            .update(Object.assign(cursor.value, payload))
            .onsuccess = (event) => {
                resolve(event.target.source.value)
            };
    })

    // called from execute_and, execute_or
    #execute_cursor_delete = (cursor) => new Promise((resolve) => {
        cursor
            .delete()
            // onsuccess result is always 'undefined', so
            // add the deleted record
            .onsuccess = (event) => {
                resolve(event.target.source.value);
            }
    });

    #execute_and = (verb, reverse = false, limit = 0, ...args) => new Promise((resolve, reject) => {
        const promises = [];

        const payload = /^(update)/.test(verb)
            ? args.pop()
            : undefined;

        const indexName = args.shift();
        const keyRange = args.shift();

        const request = this.#store
            .index(indexName)
            .openCursor(keyRange, reverse ? 'prev' : 'next');
        request.onsuccess = (event) => {
            const cursor = event.target.result;

            if (cursor && (!(limit && promises.length >= limit))) {

                // check more conditions
                // to fullfill every condition must passed
                for (let n = 0; n < args.length; n += 2) {
                    const indexName = args.shift();
                    const keyRange = args.shift();

                    if (!keyRange.includes(cursor.value[indexName])) {
                        cursor.continue();
                        return;
                    }
                }

                switch (verb) {
                    case 'query':
                        promises.push(this.#execute_cursor_query(cursor));
                        break;
                    case 'update':
                        promises.push(this.#execute_cursor_update(cursor, payload));
                        break;
                    case 'delete':
                        promises.push(this.#execute_cursor_delete(cursor));
                        break;
                    default:
                        console.error('unknown verb ', verb);
                }

                cursor.continue();

            } else Promise.all(promises).then(result => resolve(result));
        }
    });

    #execute_or = (verb, reverse = false, limit = 0, ...args) => new Promise((resolve, reject) => {
        const promises = []
        const result = new class extends Array {
            push(obj) {
                // Objects are only stringified the same, using Set() won't work
                if (!this.some(entry => JSON.stringify(entry) === JSON.stringify(obj))) {
                    super.push(obj);
                }
            }
        }

        const payload = /^(update)/.test(verb)
            ? args.pop()
            : undefined;

        let threads = 0, t = args.length / 2;

        while (args.length) {
            ++threads;
            const indexName = args.shift();
            const keyRange = args.shift();

            const request = this.#store
                .index(indexName)
                .openCursor(keyRange, reverse ? 'prev' : 'next');
            request.onsuccess = (event) => {
                console.log(threads)
                const cursor = event.target.result;

                if (cursor && (!(limit && result.length >= limit))) {
                    switch (verb) {
                        case 'query':
                            promises.push(this.#execute_cursor_query(cursor));
                            break;
                        case 'update':
                            promises.push(this.#execute_cursor_update(cursor, payload));
                            break;
                        case 'delete':
                            promises.push(this.#execute_cursor_delete(cursor));
                            break;
                        default:
                            console.error('unknown verb ', verb);
                    }

                    cursor.continue();
                } 

               // if (--threads < 0) {
/*                     resolve(Promise.all(promises).then((array) => {
                        console.log(array)
                        return Array.from(
                            new Set(array.map(entry => array[entry.id]))
                                .values()
                        )
                    })); */
                    
                    /*                     console.log(threads, promises)
                                        Promise
                                            .all(promises)
                                            .then(array => {
                                                console.log(array)
                                                const result = Array.from(
                                                    new Set(array.map(entry => array[entry['id']]))
                                                    .values()
                                                )
                                                resolve(result)
                                            });
                                            return */
                //}
            console.log(promises, threads, t)
            }
        }
        Promise.all(promises).then((a)=>{
            console.log(a)
        })
    });

    #execute = (verb, ...args) => new Promise((resolve, reject) => {
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

    where = (index, keyrange) => {

        let reverse = false, limit = 0;

        const args = [index, keyrange]

        return Object.defineProperties({
            execute_and: this.#execute_and,
            execute_or: this.#execute_or
        }, {
            reverse: {
                value: function () {
                    reverse = true;
                    return this;
                }
            },
            limit: {
                value: function (int) {
                    limit = int > 0 ? int : 0;
                    return this;
                }
            },
            query: {
                value: function () {
                    switch (true) {
                        case !!this.and: return this.execute_and('query', reverse, limit, ...args);
                        case !!this.or: return this.execute_or('query', reverse, limit, ...args);
                    }
                }
            },
            update: {
                value: function (payload) {
                    switch (true) {
                        case !!this.and: return this.execute_and('update', reverse, limit, ...args.concat(payload));
                        case !!this.or: return this.execute_or('update', reverse, limit, ...args.concat(payload));
                    }
                }
            },
            delete: {
                value: function () {
                    switch (true) {
                        case !!this.and: return this.execute_and('delete', reverse, limit, ...args);
                        case !!this.or: return this.execute_or('delete', reverse, limit, ...args);
                    }
                }
            },
            or: {
                writable: true,
                value: function () {
                    args.push(index, keyrange);
                    this.and = undefined;
                    return this;
                }
            },
            and: {
                writable: true,
                value: function () {
                    args.push(index, keyrange);
                    this.or = undefined;
                    return this;
                }
            }
        });
    }
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

    #readwrite = (ro = false, ...storeNames) => new Promise(async (resolve) => {

        const request = this.#db.transaction(storeNames, ro ? 'readonly' : 'readwrite');

        resolve(storeNames.map(storeName => {
            return new Store(request.objectStore(storeName));
        }));
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

    // functions to build keyranges
    eq = (z) => IDBKeyRange.only(z);
    le = (x) => IDBKeyRange.upperBound(x);
    lt = (x) => IDBKeyRange.upperBound(x, true);
    ge = (y) => IDBKeyRange.lowerBound(y);
    gt = (y) => IDBKeyRange.lowerBound(y, true);
    between = (x, y, bx, by) => IDBKeyRange.bound(x, y, bx, by);
    startsWith = (s) => IDBKeyRange.bound(s, s + '\uffff', true, true);
};

export { JSxdb }