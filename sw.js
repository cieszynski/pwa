importScripts('dberta/dberta.js');

const v = 2;

self.addEventListener('install', event => {
    console.log('install'/* , event */);
    event.waitUntil(
        caches.open(v).then(function (cache) {
            return cache.addAll([
                'bla.json',
            ]);
        }),
    );
});

self.addEventListener('activate', async event => {
    console.log('activate'/* , event */);
    await dberta.open('pwatest', {
        1: {
            strings: "@id,"
        }
    });
});

self.addEventListener('fetch', event => {
    console.log('fetch'/* , event */);
});

self.addEventListener('message', event => {
    console.log('message'/* , event */);
});