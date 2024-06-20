import axios from 'axios';
import fs from 'fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const CREATED_AT = new Date().toUTCString();
const UPDATED_AT = new Date().toUTCString();
const REDIRECT_URL = '\n```\nhttps://backend.composio.dev/api/v1/auth-apps/add\n```\n\n';
const HEADERS = {  
  headers: {    
    'Content-Type': 'application/json',    
    Authorization: `Bearer ${process.env.COMPOSIO_API_KEY}`,    
    Cookie: 'authToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlZWVlNGEyYS01NzhjLTRlNGYtOWM4Ni1jYTQ5NWJlZjY1MjAiLCJlbWFpbCI6Imh1ZGl4dCswMUBnbWFpbC5jb20iLCJpYXQiOjE3MTE5ODI4NzAsImV4cCI6MTcxNDU3NDg3MH0.EJoKSHriyiZtyDpAobLyBWqvZZR4osfNVwvvK_1Km2A;',  
  },
};

async function getListOfAllApps() {  
  const response = await axios.get('https://backend.composio.dev/api/v1/apps/?page=1', HEADERS);  
  return response.data;
}

const TEMPLATE_FOR_APP = `---
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
;

async function getActionsForApp(appId) {  
  const response = await axios.get(`https://backend.composio.dev/api/v1/actions?appNames=${appId}&`, HEADERS);  
  return response.data;
}

async function getAuthInfo(appId) {  
  const response = await axios.get(`https://backend.composio.dev/api/v1/apps/${appId}`, HEADERS);  
  return response.data;
}

async function getTriggersForApp(appId) {  
  const response = await axios.get(`https://backend.composio.dev/api/v1/triggers?appNames=${appId}&`, HEADERS);  
  return response.data;
}

function getActionsBlock(app, actions) {  
  let actionsBlock = `## ⚒️ Actions\n\n`;  
  if (actions.length === 0) {    
    actionsBlock += `${app.name.charAt(0).toUpperCase() + app.name.slice(1)} actions are not supported yet. In case, you’re looking for ${app.name.charAt(0).toUpperCase() + app.name.slice(1)} actions, please write to us at tech@composio.dev.`;  
  } else {    
    actionsBlock += `\n| Action Name            | Action ID                   | Description                                       |`;    
    actionsBlock += `\n| :--------------------- | :-------------------------- | :------------------------------------------------ |`;    
    actions.forEach(action => {      
      actionsBlock += `\n| ${action.display_name} | ${action.name} | ${action.description} |`;    
    });  
  }  
  return actionsBlock;
}

function getTriggersBlock(app, triggers) {  
  let triggerBlock = `\n## 🪝 Triggers\n\n`;  
  if (triggers.length === 0) {    
    triggerBlock += `${app.name.charAt(0).toUpperCase() + app.name.slice(1)} triggers are not supported yet. In case, you’re looking for ${app.name.charAt(0).toUpperCase() + app.name.slice(1)} Triggers, please write to us at tech@composio.dev.`;  
  } else {    
    triggerBlock += `\n| Trigger Name            | Trigger ID                   | Description                                       |`;    
    triggerBlock += `\n| :--------------------- | :-------------------------- | :------------------------------------------------ |`;    
    triggers.forEach(trigger => {      
      triggerBlock += `\n| ${trigger.display_name} | ${trigger.name} | ${trigger.description} |`;    
    });  
  }  
  return triggerBlock;
}

function getAuthenticationInfo(app, authInfo) {  
  const separatorToUse = authInfo.auth_schemes.length === 2 ? ' and ' : ', ';  
  return `> ${app.name.charAt(0).toUpperCase() + app.name.slice(1)} uses ${authInfo.auth_schemes.map(scheme => scheme.auth_mode).join(separatorToUse)} for authentication.`;
}

// Function to read data from Google Sheets
async function readSheetsData() {
  const oAuth2Client = new OAuth2Client();
  oAuth2Client.setCredentials({
    // Use your existing access token or refresh token here
    access_token: 'ya29.a0Ad52N3_gP-tMnytE735o8344yMtBUpg-iZbscfLz1rGwyyjBWUPberA4O6aWlBZXLmvLVXGgm5F6--hRMPqd0793mu0GlFaixBgxTP9OIO3OsT1rRX9gdziKTv8cNZmdNBNDKt11TxLCX2xoomjOrRIO8nQmDrO34rFZaCgYKAaISARISFQHGX2MiOWJt4TiFIQ2ebi0aKxDt7Q0171', 
    // or
    // refresh_token: 'YOUR_REFRESH_TOKEN',
  });

  const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
  const spreadsheetId = '1Yy9JgGlw4qslDqLCw4XEvCVmaXkke0lnyrK4X4jbeGk'; // Replace with your Google Sheet ID
  const range = 'Sheet2!A:Z'; // Replace with the range of your data

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values;
  const headers = rows[0];
  const data = rows.slice(1).map(row => {
    return headers.reduce((obj, header, index) => {
      obj[header] = row[index];
      return obj;
    }, {});
  });

  return data;
}

async function getConfigurationBlock(app,sheetsData) {

  const appData = sheetsData.find(row => row.appName === app.name);
  if (appData) {
    let configBlock = `## ⚙️ Configuration\n\n`;    
    if (appData.tip_tag_data) {      
      configBlock += `<Tip>${appData.tip_tag_data}</Tip>\n\n`;    
    }    
    if (appData.config_line_one) {      
      configBlock += `${appData.config_line_one}\n\n`;    
    }
    configBlock += `${REDIRECT_URL}`;    
    if (appData.config_line_two) {      
      configBlock += `${appData.config_line_two}\n\n`;    
    }    
    return configBlock;  
  }  
  return '';
}

async function getDocumentationBlock(app,sheetsData) {
  const appData = sheetsData.find(row => row.appName === app.name);
  let documentationBlock = '';  
  if (appData) {    
    documentationBlock += `## 📔 Documentation\n\n`;    
    if (appData.Link1) {      
      documentationBlock += `- [${appData.Link1_name}](${appData.Link1})\n`;    
    }
    if (appData.Link2) {      
      documentationBlock += `- [${appData.Link2_name}](${appData.Link2})\n`;    
    }  
  }  
  return documentationBlock;
}

async function generateDocsLink(app, pathLinks, sheetsData) {

  const appData = sheetsData.find(row => row.appName === app.name);
  if (!appData) {     
    return; // Skip if app is not found in the CSV   
  }  
  console.log(`Creating page for ${app.name}`);  
  console.log(appData.config_line_one);  
  const { items: actions } = await getActionsForApp(app.name);  
  const triggers = await getTriggersForApp(app.name);  
  const authInfo = await getAuthInfo(app.key);  
  const {status,documentation_doc_text,configuration_docs_text} = app.meta;
  
  const configurationBlock = await getConfigurationBlock(app, sheetsData);
  const documentationBlock = await getDocumentationBlock(app, sheetsData);
  
  let generatedTemplate = TEMPLATE_FOR_APP.replace('{{APP_NAME}}', app.name.charAt(0).toUpperCase() + app.name.slice(1))    
    .replace('{{CREATED_AT}}', CREATED_AT)    
    .replace('{{UPDATED_AT}}', UPDATED_AT)    
    .replace('{{APP_KEY}}', app.key)    
    .replace('{{AUTHENTICATION_BLOCK}}', getAuthenticationInfo(app, authInfo))    
    .replace('{{CONFIGURATION_BLOCK}}', configurationBlock) // Use the modified getConfigurationBlock    
    .replace('{{DOCUMENTATION_BLOCK}}', documentationBlock)    
    .replace('{{ACTIONS_BLOCK}}', getActionsBlock(app, actions))    
    .replace('{{TRIGGERS_BLOCK}}', getTriggersBlock(app, triggers));  
  pathLinks.push(`/docs_draft/${app.key}`);  
  fs.writeFileSync(`./docs_draft/${app.key}.mdx`, generatedTemplate);
}

async function main() {  
  const apps = await getListOfAllApps();  
  const pathLinks = [];
  const sheetsData = await readSheetsData(); // Call readSheetsData() once here  
  console.log(`Generating docs for ${apps.items.length} apps`);  
  // Batching to make docs generating fast. Current limit is 10 requests at a time.  
  for (let i = 0; i < apps.items.length; i += 10) {    
    console.log(`\n \n Generating docs for apps ${i + 1} to ${i + 10} |  Next: ${apps.items.length - i - 10}\n \n`);    
    const promises = apps.items.slice(i, i + 10).map(app => generateDocsLink(app, pathLinks, sheetsData));    
    await Promise.all(promises);  
  }  
  console.log('\n\nNew docs at\n');  
  console.log(pathLinks.join('\n'));
}

main();