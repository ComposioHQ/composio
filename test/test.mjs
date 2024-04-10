import chalk from "chalk"

async function saveUserData() {
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
  console.log('user_data.json created successfully.', data);

  console.log(chalk.green("Saving user data"));
}

await saveUserData();


async function runPythonCli(){


  console.log("Running ", chalk.green(`whoami`));
  let data = await $`python3 core/start_cli.py whoami`;
  console.log(data.stdout);

  console.log("Running ", chalk.green(`show-apps`));
  data = await $`python3 core/start_cli.py show-apps`;
  console.log(data.stdout);


  console.log("Running ", chalk.green(`show-connections github`));
  data = await $`python3 core/start_cli.py show-connections github`;
  console.log(data.stdout);

  console.log("Running ", chalk.green(`list-triggers github`));
  data = await $`python3 core/start_cli.py list-triggers github`;
  console.log(data.stdout);

  console.log("Running ", chalk.green(`list-triggers logout`));
  data = await $`python3 core/start_cli.py logout`;
  console.log(data.stdout);

}


await runPythonCli()