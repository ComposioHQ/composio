const userDataPath = `${process.env.HOME}/.composio`;

// Check if directory exists, delete it if it does
try {
  console.log(`rm -rf ${userDataPath}`)
  await $`rm -rf ${userDataPath}`;
  console.log(`Existing directory '${userDataPath}' deleted successfully.`);
} catch (error) {
  console.error(`Error deleting directory '${userDataPath}':`, error);
}

// Create directory and write file
await $`mkdir -p ${userDataPath}`;
await fs.writeFileSync(
  `${userDataPath}/user_data.json`,
  JSON.stringify({ "api_key": "3kmtwhffkxvwebhnm7qwzj" }, null, 2)
);

// Read file
const data = await fs.readFile(`${userDataPath}/user_data.json`, 'utf8');
console.log(data,`${userDataPath}/user_data.json`);

console.log('user_data.json created successfully.');

// Run python script
const { stdout } = await $`python3 core/start_cli.py`;
console.log(stdout);

