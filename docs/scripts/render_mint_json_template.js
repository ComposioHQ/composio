const fs = require('fs');
const ejs = require('ejs');
const path = require('path');

// Path to the mint.json.ejs template
const templatePath = path.join(__dirname, '../mint.json.ejs');

// Path to the output mint.json file
const outputPath = path.join(__dirname, '../mint.json');

// Function to read the api-reference directory and construct apiReferencePages
function getApiReferencePages() {
  const apiReferenceDir = path.join(__dirname, '../api-reference');
  const groups = fs.readdirSync(apiReferenceDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const group = dirent.name;
      const capitalizedGroup = group.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      const pages = fs.readdirSync(path.join(apiReferenceDir, group))
        .filter(file => file.endsWith('.mdx'))
        .map(file => `api-reference/${group}/${file.replace('.mdx', '')}`);

      // Custom ordering of pages
      const order = ['list', 'get', 'add', 'generate', 'create', 'update', 'delete'];
      pages.sort((a, b) => {
        const aType = order.findIndex(type => a.toLowerCase().includes(type));
        const bType = order.findIndex(type => b.toLowerCase().includes(type));
        return (aType === -1 ? order.length : aType) - (bType === -1 ? order.length : bType);
      });

      return { group: capitalizedGroup, pages };
    });
  return groups;
}

// Value for apiReferencePages
const apiReferencePages = getApiReferencePages();

// Read the template file
fs.readFile(templatePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading the template file:', err);
    return;
  }

  // Render the template with the provided data
  const rendered = ejs.render(data, { apiReferencePages });

  // Write the rendered content to the output file
  fs.writeFile(outputPath, rendered, 'utf8', (err) => {
    if (err) {
      console.error('Error writing the output file:', err);
      return;
    }

    console.log('mint.json has been generated successfully.');
  });
});
