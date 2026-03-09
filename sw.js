const v = 1;

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

self.addEventListener('activate', event => {
    console.log('activate'/* , event */);
});

self.addEventListener('fetch', event => {
    console.log('fetch'/* , event */);
});

self.addEventListener('message', event => {
    console.log('message'/* , event */);
});