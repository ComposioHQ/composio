import { Composio } from "."

const composioSDK = new Composio("tmam8qoxvuiinbsaikgh", "http://localhost:9900");

(async()=>{
const list =   await composioSDK.apps.list();

console.log(list)

})()