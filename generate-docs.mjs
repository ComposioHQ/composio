import axios from 'axios';

import fs from 'fs';

const CREATED_AT = 'Wed Mar 13 2024 15:31:02 GMT+0000 (Coordinated Universal Time)';
const UPDATED_AT = 'Wed Mar 13 2024 15:31:02 GMT+0000 (Coordinated Universal Time)';
const HEADERS = {
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.COMPOSIO_API_KEY}`,
    Cookie: 'authToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlZWVlNGEyYS01NzhjLTRlNGYtOWM4Ni1jYTQ5NWJlZjY1MjAiLCJlbWFpbCI6Imh1ZGl4dCswMUBnbWFpbC5jb20iLCJpYXQiOjE3MTE5ODI4NzAsImV4cCI6MTcxNDU3NDg3MH0.EJoKSHriyiZtyDpAobLyBWqvZZR4osfNVwvvK_1Km2A;',
  },
}
const getListOfAllApps = async () => {
  const response = await axios.get(
    'https://backend.composio.dev/api/v1/apps/?page=1',
    HEADERS
    
  );
  return response.data;
};



const TEMPLATE_FOR_APP =`---
title: {{APP_NAME}}
slug: {{APP_KEY}}
excerpt: ""
hidden: false
createdAt: {{CREATED_AT}}
updatedAt: {{UPDATED_AT}}
---

{{AUTHENTICATION_BLOCK}}

{{DOCUMENTATION_BLOCK}}

{{CONFIGURATION_BLOCK}}

{{ACTIONS_BLOCK}}

{{TRIGGERS_BLOCK}}
`

const getActionsForApp = async (appId) => {
  const response = await axios.get(
    `
    https://backend.composio.dev/api/v1/actions?appNames=${appId}&`,
    HEADERS
  );
  return response.data;
};

const getAuthInfo = async (appId) => {
  const response = await axios.get(
    `
    https://backend.composio.dev/api/v1/apps/${appId}`,
    HEADERS
  );
  return response.data;
}


const getTriggersForApp = async (appId) => {
  const response = await axios.get(
    `
    https://backend.composio.dev/api/v1/triggers?appNames=${appId}&`,
    HEADERS
  );
  return response.data;
};


function getActionsBlock(app,actions){
  let actionsBlock = `## ⚒️ Actions\n\n`;
  actionsBlock += `${app.name} has ${actions.length} actions which you can start using immediately\n\n _⚠️ All the actions are disabled by default, Please go to the Github connector page to enable the actions._\n\n`
 
  if(actions.length=== 0){
    actionsBlock += `${app.name} actions are not supported yet. In case, you’re looking for Asana actions, please write to us at tech@composio.dev.`
    return actionsBlock;
  }
  else{
    actionsBlock += `\n| Action Name            | Action ID                   | Description                                       |`
    actionsBlock += `\n| :--------------------- | :-------------------------- | :------------------------------------------------ |`
    actions.forEach(action => {
      actionsBlock += `\n| ${action.display_name} | ${action.name} | ${action.description} |`;
    });

  }

  return actionsBlock;
}

function getTriggersBlock(app,triggers){
  let triggerBlock = `## 🪝 Triggers\n\n`;

  if(triggers.length === 0){
    triggerBlock += `${app.name} triggers are not supported yet. In case, you’re looking for Asana Triggers, please write to us at tech@composio.dev.`
    return triggerBlock;
  }

 else{  
  triggerBlock += `\n| Action Name            | Action ID                   | Description                                       |`
  triggerBlock += `\n| :--------------------- | :-------------------------- | :------------------------------------------------ |`
  triggers.forEach(trigger => {
    triggerBlock += `\n| ${trigger.display_name} | ${trigger.name} | ${trigger.description} |`;
  });
}
  return triggerBlock;
}


function getAuthenticationInfo(app,authInfo){

  const separatorToUse = authInfo.auth_schemes.length===2?' and ':', '
  return `> ${app.name} uses ${authInfo.auth_schemes.map(scheme=>scheme.auth_mode).join(separatorToUse)} for authentication. Please refer to the [authentication page](/docs/authentication) for more details.`

}


async function generateDocsLink(app,pathLinks){
  console.log(`Creating page for ${app.name}`)

    console.log(`Fetching actions for ${app.name}`)
    const {items:actions} = await getActionsForApp(app.name);
    console.log(`Fetching triggers for ${app.name}`)
    const triggers = await getTriggersForApp(app.name);

    const authInfo = await getAuthInfo(app.key)
    
    let generatedTemplate = TEMPLATE_FOR_APP.replace('{{APP_NAME}}',app.name)
    .replace('{{CREATED_AT}}',CREATED_AT)
    .replace('{{UPDATED_AT}}',UPDATED_AT)
    .replace('{{APP_KEY}}',app.key)
    .replace('{{APP_NAME}}',app.name)
    .replace('{{AUTHENTICATION_BLOCK}}',getAuthenticationInfo(app,authInfo))
    .replace('{{CONFIGURATION_BLOCK}}',`[comment]: # (This is a placeholder for the configuration block)`)
    .replace('{{DOCUMENTATION_BLOCK}}',`[comment]: # (This is a placeholder for the documentation block)`)
    .replace('{{ACTIONS_BLOCK}}',getActionsBlock(app,actions))
    .replace('{{TRIGGERS_BLOCK}}',getTriggersBlock(app,triggers));

    pathLinks.push(`/docs_draft/${app.key}`)

    fs.writeFileSync(`./docs_draft/${app.key}.mdx`, generatedTemplate);
}
async function main() {
  const apps = await getListOfAllApps();

  const pathLinks =  []

  console.log(`Generating docs for ${apps.items.length} apps`)
  for (let i = 0; i < apps.items.length; i += 6) {
    console.log(`\n \n Generating docs for apps ${i+1} to ${i+6} \n \n`)
    const promises = apps.items.slice(i, i + 6).map(app => generateDocsLink(app,pathLinks));
    await Promise.all(promises);
  }


  console.log('\n\nNew docs at')
  console.log('\n')
  console.log(pathLinks.join('\n'))
}

main();

