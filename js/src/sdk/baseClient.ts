import { Composio } from "."

//const composioSDK = new Composio("tmam8qoxvuiinbsaikgh", "http://localhost:9900");
const composioSDK = new Composio("cc0fu8lookgq1ov8z4xx9n", "https://backend.composio.dev");

(async()=>{
    const list = await composioSDK.activeTriggers.enable({
        triggerId: "09d03042-ea5d-4b72-85f6-f408c52fb577"
    })

console.log(list)

})()