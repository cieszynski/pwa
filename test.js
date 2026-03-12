const blobParts = ['<q id="a"><span id="b">hey!</span></q>']; // an array

const a = [
    { id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 1, name: 'A', blob: new Blob(blobParts, { type: "text/html" }) }
]
//const a = [1, 2, 3, 2]

/* const b = a.filter((value, index, array) => {
    array.some(item=>{
        console.log(item, value)
    })

}) */

//const newArray = Array.from(new Set(a.map(o => JSON.stringify(o)))).map(o => JSON.parse(o));
let newArray = Array.from(new Set(a.map(entry => a[entry['id']])).values())
console.dir(newArray)
newArray.forEach(element => {
    if(element.blob) element.blob.text().then(t=>console.log(t))
});