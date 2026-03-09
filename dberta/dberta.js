// MIT License

// Copyright (c) 2025 Stephan Cieszynski

Object.defineProperty(globalThis, 'dberta', {

    value: globalThis?.dberta ?? new class dberta {

        open = (dbName, scheme) => new Promise((resolve, reject) => {
            if (!scheme) return reject(new DOMException(
                `database '${dbName}' no scheme found`,
                "NotFoundError"
            ));

            let isUpdated = false;

            // order the versions numerically
            const orderedSchemes = Object.keys(scheme).sort((a, b) => parseFloat(a) - parseFloat(b));

            // open the latest version or start an upgrade
            const request = indexedDB.open(dbName, orderedSchemes.at(-1));

            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(request.error);
            request.onupgradeneeded = (event) => {
                console.debug('onupgradeneeded');
                const db = request.result;
                isUpdated = true;

                for (let v = event.oldVersion + 1; v <= event.newVersion; v++) {
                    Object.entries(scheme[v]).forEach(([storeName, definition]) => {

                        // forbidden storename(s)
                        if (['transaction'].includes(storeName)) {
                            return reject(new DOMException(
                                `store name '${storeName}' not allowed`,
                                'NotAllowedError'));
                        }

                        if (Array.from(db.objectStoreNames).includes(storeName)) {
                            db.deleteObjectStore(storeName)
                        }

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
            } // onupgradeneeded

            request.onsuccess = (event) => {
                console.debug('onsuccess')
                const db = event.target.result;

                const transactionBegin = (readOnly = false, ...storeNames) => {

                    let transaction;

                    return new Promise(async (resolve, reject) => {
                        try {
                            transaction = db.transaction(storeNames, readOnly ? 'readonly' : 'readwrite');

                            resolve(storeNames.reduce((obj, storeName) => {
                                const store = transaction.objectStore(storeName);

                                // Find all lowercase and uppercase
                                // combinations of a string
                                // called from ingnoreCase
                                const permutation = (permutable) => {

                                    const arr = [];
                                    const permute = (str, tmp = '') => {
                                        if (str.length == 0) {

                                            arr.push(tmp);
                                        } else {
                                            permute(str.substring(1), tmp + str[0].toLowerCase());
                                            if (isNaN(str[0])) {
                                                permute(str.substring(1), tmp + str[0].toUpperCase());
                                            }
                                        }
                                    }

                                    permute(permutable);

                                    // sort from ABC -> abc
                                    return arr.sort();
                                }

                                // called from 
                                // add, clear, count, delete, get,  
                                // getKey, getAll, getAllKeys, put
                                const execute = (verb, ...args) => {
                                    return new Promise(async (resolve, reject) => {
                                        // errors bubble up to db
                                        db.onerror = (event) => { reject(event.target.error) }
                                        try {
                                            store[verb](...args).onsuccess = (event) => {
                                                resolve(event.target.result);
                                            };
                                        } catch(err) {
                                                reject(err);
                                            }
                                        });
                                }

                                // called from execute_and, execute_or
                                const execute_cursor_query = (cursor, result) => {
                                    result.push(cursor.value);
                                }

                                // called from execute_and, execute_or
                                const execute_cursor_update = (cursor, result, payload) => {
                                    // only {} records reach this, so we can merge
                                    cursor
                                        .update(Object.assign(cursor.value, payload))
                                        .onsuccess = (event) => {
                                            // add the updated record
                                            result.push(event.target.source.value);
                                        };
                                }

                                // called from execute_and, execute_or
                                const execute_cursor_delete = (cursor, result) => {
                                    cursor
                                        .delete()
                                        // onsuccess result is always 'undefined', so
                                        // add the deleted record
                                        .onsuccess = (event) => { result.push(event.target.source.value); }
                                }

                                // called from queryAnd, updateAnd, deleteAnd
                                const execute_and = (verb, ...args) => {

                                    return new Promise(async (resolve, reject) => {
                                        try {
                                            const result = []

                                            const payload = /^(update)/.test(verb)
                                                ? args.pop()
                                                : undefined;

                                            const indexName = args.shift();
                                            const keyRange = args.shift();

                                            const request = store
                                                .index(indexName)
                                                .openCursor(keyRange);
                                            request.onsuccess = (event) => {
                                                const cursor = event.target.result;

                                                if (cursor) {

                                                    // check more conditions
                                                    // to fullfill every condition must passed
                                                    for (let n = 0; n < args.length; n += 2) {
                                                        const indexName = args[n];
                                                        const keyRange = args[n + 1];

                                                        if (!keyRange.includes(cursor.value[indexName])) {
                                                            cursor.continue();
                                                            return;
                                                        }
                                                    }

                                                    switch (verb) {
                                                        case 'query':
                                                            execute_cursor_query(cursor, result);
                                                            break;
                                                        case 'update':
                                                            execute_cursor_update(cursor, result, payload);
                                                            break;
                                                        case 'delete':
                                                            execute_cursor_delete(cursor, result);
                                                            break;
                                                        default:
                                                            console.error('unknown verb ', verb);
                                                    }

                                                    cursor.continue();
                                                } else {
                                                    resolve(result);
                                                }
                                            }
                                        } catch (err) {
                                            if (transaction) { transaction.abort(); }
                                            reject(err);
                                        }
                                    });
                                }

                                // called from queryOr, updateOr, deleteOr
                                const execute_or = (verb, ...args) => {

                                    return new Promise(async (resolve, reject) => {
                                        try {
                                            const result = new class extends Array {
                                                push(obj) {
                                                    // Objects are only stringified the same, Set() won't work
                                                    if (!this.some(entry => JSON.stringify(entry) === JSON.stringify(obj))) {
                                                        super.push(obj);
                                                    }
                                                }
                                            }

                                            const payload = /^(update)/.test(verb)
                                                ? args.pop()
                                                : undefined;

                                            let threads = 0;

                                            while (args.length) {
                                                ++threads;
                                                const indexName = args.shift();
                                                const keyRange = args.shift();

                                                const request = store
                                                    .index(indexName)
                                                    .openCursor(keyRange);
                                                request.onsuccess = (event) => {
                                                    const cursor = event.target.result;

                                                    if (cursor) {
                                                        switch (verb) {
                                                            case 'query':
                                                                execute_cursor_query(cursor, result);
                                                                break;
                                                            case 'update':
                                                                execute_cursor_update(cursor, result, payload);
                                                                break;
                                                            case 'delete':
                                                                execute_cursor_delete(cursor, result);
                                                                break;
                                                            default:
                                                                console.error('unknown verb ', verb);
                                                        }

                                                        cursor.continue();
                                                    } else {
                                                        if (--threads <= 0) {
                                                            resolve(result);
                                                        }
                                                    }
                                                }
                                            }
                                        } catch (err) {
                                            if (transaction) { transaction.abort(); }
                                            reject(err);
                                        }
                                    });
                                }

                                obj[storeName] = {
                                    add(obj, key) { return execute('add', obj, key); },

                                    clear() { return execute('clear'); },

                                    count(keyOrKeyRange) { return execute('count', keyOrKeyRange); },

                                    delete(keyOrKeyRange) { return execute('delete', keyOrKeyRange); },

                                    get(keyOrKeyRange) { return execute('get', keyOrKeyRange); },

                                    getKey(keyOrKeyRange) { return execute('getKey', keyOrKeyRange); },

                                    getAll(keyRange, limit) { return execute('getAll', keyRange, limit); },

                                    getAllKeys(keyRange, limit) { return execute('getAllKeys', keyRange, limit); },

                                    put(obj, key) { return execute('put', obj, key); },

                                    where(indexName, keyRange, limit = 0, direction = 'next') {

                                        return new Promise(async (resolve, reject) => {
                                            try {
                                                const result = [];

                                                const request = store.index(indexName)
                                                    .openCursor(keyRange, direction);

                                                request.onsuccess = () => {
                                                    const cursor = request.result;

                                                    if (cursor) {
                                                        result.push(cursor.value);

                                                        if (!(limit && result.length >= limit)) {
                                                            cursor.continue();
                                                            return;
                                                        }
                                                    }
                                                    resolve(result);

                                                };
                                            } catch (err) {
                                                if (transaction) { transaction.abort(); }
                                                reject(err);
                                            }
                                        });
                                    }, // END where

                                    queryAnd(...args) { return execute_and('query', ...args) },
                                    updateAnd(...args) { return execute_and('update', ...args) },
                                    deleteAnd(...args) { return execute_and('delete', ...args) },

                                    queryOr(...args) { return execute_or('query', ...args) },
                                    updateOr(...args) { return execute_or('update', ...args) },
                                    deleteOr(...args) { return execute_or('delete', ...args) },

                                    ignoreCase(indexName, str, startsWith = false) {
                                        let n = 0;
                                        const permutations = permutation(str);

                                        return new Promise(async (resolve, reject) => {
                                            try {
                                                const result = [];

                                                const request = store
                                                    .index(indexName)
                                                    .openCursor();
                                                request.onsuccess = (event) => {
                                                    const cursor = event.target.result;

                                                    if (cursor) {

                                                        const value = cursor.value[indexName];
                                                        const length = startsWith
                                                            ? permutations[0].length
                                                            : value.length;

                                                        // find cursor.value[indexName] > permutation
                                                        while (value.substring(0, length) > permutations[n]) {

                                                            // there are no more permutations
                                                            if (++n >= permutations.length) {
                                                                resolve(result);
                                                                return;
                                                            }
                                                        }

                                                        if ((startsWith && value.indexOf(permutations[n]) === 0)
                                                            || value === permutations[n]) {

                                                            result.push(cursor.value);
                                                            cursor.continue();
                                                        } else {
                                                            cursor.continue(permutations[n]);
                                                        }
                                                    } else {
                                                        resolve(result);
                                                    }
                                                }
                                            } catch (err) {
                                                if (transaction) { transaction.abort(); }
                                                reject(err);
                                            }
                                        });
                                    } // END ignoreCase
                                }

                                return obj;
                            }, { // to access from outside
                                //transaction: transaction
                                commit() { transaction.commit(); },
                                abort() { transaction.abort(); }
                            }));
                        } catch (err) {
                            if (transaction) { transaction.abort(); }
                            reject(err);
                        }
                    });
                } // END transactionBegin

                resolve({
                    write(...args) { return transactionBegin(false, ...args); },
                    read(...args) { return transactionBegin(true, ...args); },
                    close() { db.close(); },
                    delete() {
                        db.close();
                        return new Promise((resolve, reject) => {
                            const request = indexedDB.deleteDatabase(db.name);
                            request.onerror = () => reject(request.error);
                            request.onsuccess = () => resolve(request.result);
                        });
                    },
                    get objectStoreNames() { return Array.from(db.objectStoreNames); },
                    get updated() { return isUpdated },
                    get version() { return db.version; },
                    get name() { return db.name; }
                });
            } // request.onsuccess
        }); // END open

        // functions to build keyranges
        eq = (z) => IDBKeyRange.only(z);
        le = (x) => IDBKeyRange.upperBound(x);
        lt = (x) => IDBKeyRange.upperBound(x, true);
        ge = (y) => IDBKeyRange.lowerBound(y);
        gt = (y) => IDBKeyRange.lowerBound(y, true);
        between = (x, y, bx, by) => IDBKeyRange.bound(x, y, bx, by);
        startsWith = (s) => IDBKeyRange.bound(s, s + '\uffff', true, true);
    }
}); // Object.defineProperty