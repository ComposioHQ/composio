const userDataPath = '~/.composio';

// Check if directory exists, delete it if it does
try {
  console.log(`sudo rm -rf ${userDataPath}`)
  await $`rm -rf ${userDataPath}`;
  console.log(`Existing directory '${userDataPath}' deleted successfully.`);
} catch (error) {
  console.error(`Error deleting directory '${userDataPath}':`, error);
}

// Create directory and write file
await $`sudo mkdir -p ${userDataPath}`;
await fs.write(
  `${userDataPath}/user_data.json`,
  JSON.stringify({ "api_key": "3kmtwhffkxvwebhnm7qwzj" }, null, 2)
);
// console.log('user_data.json created successfully.');