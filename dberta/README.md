# dberta

***dberta.js*** is a promise-based and transactional wrapper for indexedDB.

Find more information on the [wiki](../../wiki).

## Example

```javascript
let berta;

dberta.open("berta1", {
    1: {
        user: "@id3, *firstname, lastname, age, lastname+age",
        events: "@id, date, title, !code",
    },
}).then((result) => {
    berta = result;
});
```

```javascript
async function init() {
    try {
        const ta = await berta.write("user", "events");

        await ta.user.add(
            {
                firstname: "Albert",
                lastname: "Einstein",
                age: 76,
            },
        );

        await ta.user.add(
            {
                firstname: "Isaac",
                lastname: "Newton",
                age: 84,
            },
        );

        await ta.events.add(
            {
                date: new Date(),
                title: "Current Date",
                code: crypto.randomUUID(),
            },
        );

        ta.commit();
    } catch ({ name, message }) {
        console.error(name, message);
    }
}
```

```javascript
async function query() {
    try {
        const ta = await berta.read("user");

        const r1 = await ta.user.getAll();
        // [
        //  {firstname: 'Albert', lastname: 'Einstein', age: 76, id3: 1},
        //  {firstname: 'Isaac', lastname: 'Newton', age: 84, id3: 2}
        // ]
        console.log(r1);

        const r2 = await ta.user.where("firstname", dberta.eq("Albert"));
        // [
        //  {firstname: 'Albert', lastname: 'Einstein', age: 76, id3: 1
        // ]
        console.log(r2);

        const r3 = await ta.user.queryAnd("firstname", dberta.eq("Isaac"), "lastname", dberta.eq("Newton") );
        // [
        //  {firstname: 'Isaac', lastname: 'Newton', age: 84, id3: 2}
        // ]
        console.log(r3);

        const r4 = await ta.user.queryOr(
            "firstname",
            dberta.eq("Isaac"),
            "age",
            dberta.lt(80),
        );
        // [
        //  {firstname: 'Isaac', lastname: 'Newton', age: 84, id3: 2},
        //  {firstname: 'Albert', lastname: 'Einstein', age: 76, id3: 1}
        // ]
        console.log(r4);

        const r5 = await ta.user.ignoreCase("firstname", "ISAAC");
        // [
        //  {"firstname": "Isaac", "lastname": "Newton", "age": 84, "id3": 2}
        // ]
        console.log(r5);
    } catch ({ name, message }) {
        console.error(name, message);
    }
}
```

```javascript
async function update() {
    try {
        const ta = await berta.write("user");

        const r6 = await ta.user.updateOr(
            "age",
            dberta.lt(80),
            "firstname",
            "Albert",
            {
                nobelprize: 1921,
            },
        );

        // [1]
        console.log(r6);
    } catch ({ name, message }) {
        console.error(name, message);
    }
}
```

```javascript
async function abort() {
    try {
        const ta = await berta.write("user");

        const r7 = await ta.user.updateOr(
            "age",
            dberta.gt(80),
            "firstname",
            "Isaac",
            {
                nobelprize: 1921,
            },
        );

        ta.abort();

        // shows a key, but no record was modified
        // [1]
        console.log(r7);
    } catch ({ name, message }) {
        console.error(name, message);
    }
}
```
