import fs from 'fs';

const pathToBotFiles = './';

const configsTemplateJson = JSON.parse(fs.readFileSync(pathToBotFiles + 'config-template.json'));
const userconfigs = JSON.parse(fs.readFileSync(pathToBotFiles + 'user-configs.json'));
console.log(configsTemplateJson);
console.log(userconfigs);
const validatedConfigs = userconfigs; //configValidation.validate({configsTemplateJson, userconfigs});

let scriptFilePath;
if (userconfigs.compatability && fs.existsSync(pathToBotFiles + userconfigs.compatability + '.js')){
    scriptFilePath = pathToBotFiles + userconfigs.compatability + '.js';
} else {
    scriptFilePath = pathToBotFiles + 'script.js';
}
console.log('running', scriptFilePath);
const script = await import(scriptFilePath);
script.run(validatedConfigs, userconfigs.compatability);
