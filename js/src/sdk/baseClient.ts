import { Composio } from "."
const composioSDK = new Composio("tmam8qoxvuiinbsaikgh", "http://localhost:9900")

composioSDK.getClientId().then((data)=>{
    console.log(data)

})