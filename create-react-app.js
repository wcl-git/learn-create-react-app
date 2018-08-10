const validateProjectName = require('validate-npm-package-name'); // 检测包名
const chalk = require("chalk"); //  给打印信息添加颜色
const commander = require('commander'); //tj大神的神作，
const fs = require('fs-extra'); //node模块的文件系统的加强
const path = require('path'); // node 路径模块
 // node子进程模块，第一个参数要运行的命令，第二个是一个对象，具体可以看node文档
const execSync = require('child_process').execSync;
// node子进程模块的 spawn 方法优化，解决兼容window， 参数和execSync一样
// child_process.spawn() 方法使用给定的 command 和 args 中的命令行参数来衍生一个新进程。 如果省略 args，则默认为一个空数组。
const spawn = require('cross-spawn');
const semver = require('semver'); // 用于比较node版本
const dns = require('dns'); // node 模块域名解析

const tmp = require('tmp'); // nodejs临时文件和目录上生成器 tmp.dir(...)异步目录创建

const unpack = require('tar-pack').unpack; // tar-pack 是打包和解包工具， unpack为解包

const url = require('url'); // node 网址路径模块

const hyperquest = require('hyperquest'); // 将HTTP请求视为流式传输的工具

const envinfo = require('envinfo');  // 字面理解 获取环境信息

const os = require('os'); // node 操作系统模块，一般用 os.EOL,一个字符串常量，定义操作系统相关的行末标志
//封装的方法
const findMonorepo = require('react-dev-utils/workspaceUtils').findMonorepo;
// 引进packgeJson
const packageJson = require('./package.json');


const errorLogFilePatterns = [
  'npm-debug.log',
  'yarn-error.log',
  'yarn-debug.log',
];

let projectName; // 定义了一个用来存储项目名称的变量

const program = new commander.Command(packageJson.name)

  .version(packageJson.version) // 输入版本信息，使用`create-react-app -v`的时候就用打印版本信息
  
  .arguments('<project-directory>') // 使用`create-react-app <my-project>`尖括号中的参数
  
  .usage(`${chalk.green('<project-directory>')} [options]`)// 使用`create-react-app` 第一行打印，的使用说明
  
  .action(name => {
    projectName = name; // 此处action函数的参数就是之前argument中的<project-directory>初始化项目名称
  })

  .option('--verbose', 'print additional logs') // option 配置`create-react-app -[options]`的选项，类似--help -V

  .option('--info', 'print environment debug info') // 打印本地相关开发环境，操作系统，node 版本等等
  
  .option(
    '--script-version <alternative-package>',
    'use a non-standard version of react-scripts'
  ) // 指定特殊的`react-scripts`

  .option('--use-npm')// 默认使用yarn 指定使用 npm

  .allowUnknowOption() // 允许无效的option 只是没有效果

  .on('--help', () => {
    `....一大堆打印信息`
  }) // 用来定制打印帮助信息 当使用 create react app -h (or --help) 的时候就会执行里面的代码

  .parse(process.argv); // 这个是解析node 进程，如果没有这一行，commander 就不能接管node

// 上面代码 new commander， 是TJ 大神的神作


if(program.info) { // 打印当前环境信息，最新写法是 console.log(evinfo.run(...))；后面的then不用
  console.log(chalk.bold('\nEnvironment Info:'));
  return envinfo
    .run(
      {
        System: ['OS', 'CPU'],
        Binaries: ['Node', 'npm', 'Yarn'],
        Browsers: ['Chrome', 'Edge', 'Internet Explorer', 'Firefox', 'Safari'],
        npmPackages: ['react', 'react-dom', 'react-scripts'],
        npmGlobalPackages: ['create-react-app'],
      },
      {
        clipboard: true,
        duplicates: true,
        showNotFound: true,
      }

    )
    .then(console.log)
    .then(() => console.log(chalk.green('Copied To Clipboard!\n')));
}

if (typeof projectName === 'undefined') { // 如果名字为空，打印一堆提示，则退出进程
  `...一大堆打印信息`
  process.exit(1); // 退出进程
}

function printValidationResults(results) { // 顾名思义，打印检测结果
  if (typeof results !== 'undefined') {
    results.forEach(error => {
      console.error(chalk.red(`  *  ${error}`));
    });
  }
}

const hiddenProgram = new commander.Command() 
  .option(
    '--internal-testing-template <path-to-template>',
    '(internal usage only, DO NOT RELY ON THIS) ' +
      'use a non-standard application template'
  )
  // 隐藏选项，估计是内部开发人员使用，我们最好别用，就不解释了

  .parse(process.argv); // commander接管node进程

/**顾名思义，创建一个项目，
 第一个参数: 初始化项目的名称
 第二个参数： commoder的option选项，加了就是true,不加就是false， 作用是打印一些错误日志
 第三个参数： 指定 react-script版本
 第四个参数： 指定 使用npm，默认 yarn
 第五个参数：隐藏项，上面描述的，一般是内部人用，不过你想用也是可以的，不推荐用
 */
  createApp(
  projectName,
  program.verbose,
  program.scriptsVersion,
  program.useNpm,
  hiddenProgram.internalTestingTemplate
);


/** createApp 干了什么 
   在目录下创建一个目录，判断是否已经有此目录，确保目录存在
   校验目录名称是否合法，
   往目录里面写入一个packge.json文件
   判断react-script node 然后执行

   用到的函数
   checkAppName()                  用于检测文件名是否合法
   isSafeToCreateProjectIn()       用于检测文件是创建环境是否安全
   shouldUseYarn()                 用于检测yarn在本机是否已装
   checkThatNpmCanReadCwd()        用于检测npm是否在正确的目录下执行
   checkNpmVersion()               检测npm 版本
*/
function createApp(name, verbose, version, useNpm, template) {
  const root = path.resolve(name); // 获取当前进程的路径
  const appName = path.basename(root); // path模块的获取path最后一部分

  checkAppName(appName); // 顾名思义，检查名字是否合法
  fs.ensureDirSync(name); // fs代替品，确保目录存在。如果目录结构不存在，则创建目录结构

  if (!isSafeToCreateProjectIn(root, name)) { // 判断如果项目已经存在，就退出进程
    process.exit(1);
  }

  console.log(`Creating a new React app in ${chalk.green(root)}.`);
  console.log();

  const packageJson = { // 定义一个对象，取packge.json里的一部分，
    name: appName,
    version: '0.1.0',
    private: true,
  };

  // 写入文件，和nodejs fs API一样，下面意思是，找到当前目录下package.json写入第二个参数内容
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL // 三个参数，第二个是过滤，这里为NULL不过滤，2是规定换行空格为2
  );

  const useYarn = useNpm ? false : shouldUseYarn(root);

  const originalDirectory = process.cwd(); // 存一下初始化的目录路径

  process.chdir(root); // 方法变更Node.js进程的当前工作目录，也就是 新建的项目下面，而不是初始化目录

  if (!useYarn && !checkThatNpmCanReadCwd()) { // 路径不对，就退出
    process.exit(1);
  }

  if (!semver.satisfies(process.version, '>=6.0.0')) { // 检测node版本小于 6.0.0
    console.log(
      chalk.yellow(
        `You are using Node ${
          process.version
        } so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
          `Please update to Node 6 or higher for a better, fully supported experience.\n`
      )
    );
    // Fall back to latest supported react-scripts on Node 4
    version = 'react-scripts@0.9.x';
  }

  if (!useYarn) {
    const npmInfo = checkNpmVersion(); // 同样是版本检测
    if (!npmInfo.hasMinNpm) {
      if (npmInfo.npmVersion) {
        console.log(
          chalk.yellow(
            `You are using npm ${
              npmInfo.npmVersion
            } so the project will be boostrapped with an old unsupported version of tools.\n\n` +
              `Please update to npm 3 or higher for a better, fully supported experience.\n`
          )
        );
      }
      // Fall back to latest supported react-scripts for npm 3
      version = 'react-scripts@0.9.x';
    }
  }

  // 传入这些参数执行run函数
  // 执行完毕上述代码以后，将执行`run`函数，核心函数`run`
  run(root, appName, version, verbose, originalDirectory, template, useYarn);
}

// 用于检测文件名是否合法
function checkAppName(appName) { 
  const validationResult = validateProjectName(appName); // 检测包名，返回 {validForNewPackages:true,validForOldPackages: true}
  if (!validationResult.validForNewPackages) { // 如果包名已存在，则退出
    console.error(
      `Could not create a project called ${chalk.red(
        `"${appName}"`
      )} because of npm naming restrictions:`
    );
    printValidationResults(validationResult.errors);
    printValidationResults(validationResult.warnings);
    process.exit(1);  // 退出
  }

  // TODO: there should be a single place that holds the dependencies
  const dependencies = ['react', 'react-dom', 'react-scripts'].sort(); // packge.json 里面dependencies 内容
  if (dependencies.indexOf(appName) >= 0) { // 如果name 和里面的依赖名字相同，则退出
    console.error(
      chalk.red(
        `We cannot create a project called ${chalk.green(
          appName
        )} because a dependency with the same name exists.\n` +
          `Due to the way npm works, the following names are not allowed:\n\n`
      ) +
        chalk.cyan(dependencies.map(depName => `  ${depName}`).join('\n')) +
        chalk.red('\n\nPlease choose a different project name.')
    );
    process.exit(1);
  }
}

// 用于检测文件是创建环境是否安全
function isSafeToCreateProjectIn(root, name) {
  // 定义一堆文件名
  const validFiles = [
    '.DS_Store',
    'Thumbs.db',
    '.git',
    '.gitignore',
    '.idea',
    'README.md',
    'LICENSE',
    'web.iml',
    '.hg',
    '.hgignore',
    '.hgcheck',
    '.npmignore',
    'mkdocs.yml',
    'docs',
    '.travis.yml',
    '.gitlab-ci.yml',
    '.gitattributes',
  ];
  console.log();

  const conflicts = fs
    .readdirSync(root)  // 返回一个不包括 '.' 和 '..' 的文件名的数组
    .filter(file => !validFiles.includes(file))
    // Don't treat log files from previous installation as conflicts
    .filter(
      file => !errorLogFilePatterns.some(pattern => file.indexOf(pattern) === 0)
    );

  if (conflicts.length > 0) {  //如果文件有冲突，退出进程
    console.log(
      `The directory ${chalk.green(name)} contains files that could conflict:`
    );
    console.log();
    for (const file of conflicts) {
      console.log(`  ${file}`);
    }
    console.log();
    console.log(
      'Either try using a new directory name, or remove the files listed above.'
    );

    return false;
  }

  // Remove any remnant files from a previous installation
  // 删除以前的安装的所有残余文件
  const currentFiles = fs.readdirSync(path.join(root));
  currentFiles.forEach(file => {
    errorLogFilePatterns.forEach(errorLogFilePattern => {
      // This will catch `(npm-debug|yarn-error|yarn-debug).log*` files
      if (file.indexOf(errorLogFilePattern) === 0) {
        fs.removeSync(path.join(root, file));
      }
    });
  });
  return true;
}

// 判断是否安装 yarn 如果没安装，useYarn 就为false， 默认 npm 安装
function shouldUseYarn(appDir) {
  const mono = findMonorepo(appDir);
  return (mono.isYarnWs && mono.isAppIncluded) || isYarnAvailable();
}

// 判断yarn是否可用
function isYarnAvailable() {
  try {
    execSync('yarnpkg --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

 // 用于检测npm是否在正确的目录下执行，路径不对和window 32位 不支持
function checkThatNpmCanReadCwd() {
  const cwd = process.cwd(); // 返回 Node.js 进程当前工作的目录。
  let childOutput = null;
  try {
    
    // 相当于执行`npm config list`并将其输出的信息组合成为一个字符串
    childOutput = spawn.sync('npm', ['config', 'list']).output.join('');
  } catch (err) {
    return true;
  }
  // 判断是否是一个字符串
  if (typeof childOutput !== 'string') {
    return true;
  }
  // 转为数组
  const lines = childOutput.split('\n');
  // `npm config list` output includes the following line:
  // "; cwd = C:\path\to\current\dir" (unquoted)
  // I couldn't find an easier way to get it.
  // 定义前缀
  const prefix = '; cwd = ';
  // 查找每个line第一个元素有这个前缀的一行
  const line = lines.find(line => line.indexOf(prefix) === 0);
  if (typeof line !== 'string') {
    // Fail gracefully. They could remove it.
    return true;
  }
  // 取出最后一个的信息，就是`npm`执行的目录
  const npmCWD = line.substring(prefix.length);
  if (npmCWD === cwd) {
    return true;
  }
  console.error(
    chalk.red(
      `Could not start an npm process in the right directory.\n\n` +
        `The current directory is: ${chalk.bold(cwd)}\n` +
        `However, a newly started npm process runs in: ${chalk.bold(
          npmCWD
        )}\n\n` +
        `This is probably caused by a misconfigured system terminal shell.`
    )
  );

  // 这里是老系统window 比如 32位 不支持
  if (process.platform === 'win32') {
    console.error(
      chalk.red(`On Windows, this can usually be fixed by running:\n\n`) +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKCU\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n` +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKLM\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n\n` +
        chalk.red(`Try to run the above two lines in the terminal.\n`) +
        chalk.red(
          `To learn more about this problem, read: https://blogs.msdn.microsoft.com/oldnewthing/20071121-00/?p=24433/`
        )
    );
  }
  return false;
}

// npm 版本检测， 这里没甚好说的啊
function checkNpmVersion() {
  let hasMinNpm = false;
  let npmVersion = null;
  try {
    npmVersion = execSync('npm --version')
      .toString()
      .trim();
    hasMinNpm = semver.gte(npmVersion, '3.0.0');
  } catch (err) {
    // ignore
  }
  return {
    hasMinNpm: hasMinNpm,
    npmVersion: npmVersion,
  };
}

/** run 五个参数 
  项目目录路径
  项目名称
  react-scripts的版本
  verbose  打印附加日志用
  初始化项目的原始路径
  template 这个是内部人员使用
  是否使用 yarn 开发 默认 npm

  用到的函数： 
  getInstallPackage // 获取安装包信息
  getPackageName    // 获取依赖包名称并返回  
  checkIfOnline     // 检查网络连接是否正常
  install           // 安装开发依赖包
  init              // 将事先定义好的目录文件拷贝到我的项目中
  checkNodeVersion  // 检查当前`Node`版本是否支持包
  setCaretRangeForRuntimeDeps  检查发开依赖是否正确安装，版本是否正确
*/ 
function run(root, appName, version, verbose, originalDirectory, template, useYarn) {

  const packageToInstall = getInstallPackage(version, originalDirectory); // 获取安装包信息

  const allDependencies = ['react', 'react-dom', packageToInstall]; // packge.json Dependencies依赖 

  console.log('Installing packages. This might take a couple of minutes.');
  getPackageName(packageToInstall) // 获取依赖包名称并返回
    .then(packageName =>
      // 顾名思义，检查是否离线模式，并返回结果和包名
      checkIfOnline(useYarn).then(isOnline => ({
        isOnline: isOnline,
        packageName: packageName,
      }))
    )
    .then(info => { // 接受上述包名，和是否离线
      const isOnline = info.isOnline;
      const packageName = info.packageName;
      console.log(
        `Installing ${chalk.cyan('react')}, ${chalk.cyan(
          'react-dom'
        )}, and ${chalk.cyan(packageName)}...`
      );
      console.log();
      // 调用安装方法，并返回包名，
      return install(root, useYarn, allDependencies, verbose, isOnline).then(
        () => packageName
      );
    })
    .then(packageName => {
      checkNodeVersion(packageName); // 检查当前`Node`版本是否支持包
      setCaretRangeForRuntimeDeps(packageName); // 检查发开依赖是否正确安装，版本是否正确
      
      const scriptsPath = path.resolve( // react-scripts 脚本的目录
        process.cwd(),
        'node_modules',
        packageName,
        'scripts',
        'init.js'
      );
      // 引入 init.js这个包
      const init = require(scriptsPath);

      init(root, appName, verbose, originalDirectory, template); // // 执行目录的拷贝
      // 下面是一些条件判断，版本低警告一下，报错，把已安装的文件删掉，提示错误，并退出进程
      if (version === 'react-scripts@0.9.x') {
        console.log(
          chalk.yellow(
            `\nNote: the project was bootstrapped with an old unsupported version of tools.\n` +
              `Please update to Node >=6 and npm >=3 to get supported tools in new projects.\n`
          )
        );
      }
    })
    .catch(reason => {
      console.log();
      console.log('Aborting installation.');
      if (reason.command) {
        console.log(`  ${chalk.cyan(reason.command)} has failed.`);
      } else {
        console.log(chalk.red('Unexpected error. Please report it as a bug:'));
        console.log(reason);
      }
      console.log();

      // On 'exit' we will delete these files from target directory.
      const knownGeneratedFiles = ['package.json', 'node_modules'];
      const currentFiles = fs.readdirSync(path.join(root));
      currentFiles.forEach(file => {
        knownGeneratedFiles.forEach(fileToMatch => {
          // This remove all of knownGeneratedFiles.
          if (file === fileToMatch) {
            console.log(`Deleting generated file... ${chalk.cyan(file)}`);
            fs.removeSync(path.join(root, file));
          }
        });
      });
      const remainingFiles = fs.readdirSync(path.join(root));
      if (!remainingFiles.length) {
        // Delete target folder if empty
        console.log(
          `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
            path.resolve(root, '..')
          )}`
        );
        process.chdir(path.resolve(root, '..')); // 变更目录
        fs.removeSync(path.join(root)); // 删除文件
      }
      console.log('Done.');
      process.exit(1);
    });
}

// 获取安装包信息，并返回react-script 版本，都是一些字符串拼接
function getInstallPackage(version, originalDirectory) {
  let packageToInstall = 'react-scripts';
  const validSemver = semver.valid(version); // 校验版本号是否合法， 一个参数就是放回参数版本，两个就返回bool值
  if (validSemver) {
    packageToInstall += `@${validSemver}`;
  } else if (version) {
    if (version[0] === '@' && version.indexOf('/') === -1) {
      packageToInstall += version;
    } else if (version.match(/^file:/)) {
      packageToInstall = `file:${path.resolve(
        originalDirectory,
        version.match(/^file:(.*)?$/)[1]
      )}`;
    } else {
      // for tar.gz or alternative paths
      packageToInstall = version;
    }
  }
  return packageToInstall;
}

// 获取依赖包名称并返回
function getPackageName(installPackage) {
  if (installPackage.match(/^.+\.(tgz|tar\.gz)$/)) {
    return getTemporaryDirectory()
      .then(obj => {
        let stream;
        if (/^http/.test(installPackage)) {
          stream = hyperquest(installPackage);
        } else {
          stream = fs.createReadStream(installPackage);
        }
        return extractStream(stream, obj.tmpdir).then(() => obj);// 返回一个流式
      })
      .then(obj => {
        const packageName = require(path.join(obj.tmpdir, 'package.json')).name;
        obj.cleanup();
        return packageName;
      })
      .catch(err => {
        // The package name could be with or without semver version, e.g. react-scripts-0.2.0-alpha.1.tgz
        // However, this function returns package name only without semver version.
        console.log(
          `Could not extract the package name from the archive: ${err.message}`
        );
        const assumedProjectName = installPackage.match(
          /^.+\/(.+?)(?:-\d+.+)?\.(tgz|tar\.gz)$/
        )[1];
        console.log(
          `Based on the filename, assuming it is "${chalk.cyan(
            assumedProjectName
          )}"`
        );
        return Promise.resolve(assumedProjectName);
      });
  } else if (installPackage.indexOf('git+') === 0) {
    // Pull package name out of git urls e.g:
    // git+https://github.com/mycompany/react-scripts.git
    // git+ssh://github.com/mycompany/react-scripts.git#v1.2.3
    return Promise.resolve(installPackage.match(/([^/]+)\.git(#.*)?$/)[1]);
  } else if (installPackage.match(/.+@/)) {
    // Do not match @scope/ when stripping off @version or @tag
    return Promise.resolve(
      installPackage.charAt(0) + installPackage.substr(1).split('@')[0]
    );
  } else if (installPackage.match(/^file:/)) {
    const installPackagePath = installPackage.match(/^file:(.*)?$/)[1];
    const installPackageJson = require(path.join(
      installPackagePath,
      'package.json'
    ));
    return Promise.resolve(installPackageJson.name);
  }
  return Promise.resolve(installPackage);
}

// 获取一个临时目录
function getTemporaryDirectory() {
  return new Promise((resolve, reject) => {
    // 异步目录创建
    tmp.dir({ unsafeCleanup: true }, (err, tmpdir, callback) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          tmpdir: tmpdir,
          cleanup: () => {
            try {
              callback();
            } catch (ignored) {
              // Callback might throw and fail, since it's a temp directory the
              // OS will clean it up eventually...
            }
          },
        });
      }
    });
  });
}

// 边生成边执行，
function extractStream(stream, dest) { 
  return new Promise((resolve, reject) => {
    stream.pipe(
      unpack(dest, err => {
        if (err) {
          reject(err);
        } else {
          resolve(dest);
        }
      })
    );
  });
}

// 检查node版本，没什么好说的
function checkNodeVersion(packageName) {
  const packageJsonPath = path.resolve(
    process.cwd(),
    'node_modules',
    packageName,
    'package.json'
  );
  const packageJson = require(packageJsonPath);
  if (!packageJson.engines || !packageJson.engines.node) {
    return;
  }

  if (!semver.satisfies(process.version, packageJson.engines.node)) {
    console.error(
      chalk.red(
        'You are running Node %s.\n' +
          'Create React App requires Node %s or higher. \n' +
          'Please update your version of Node.'
      ),
      process.version,
      packageJson.engines.node
    );
    process.exit(1);
  }
}
// packge.json dependencies  字段生成版本号
function makeCaretRange(dependencies, name) {
  const version = dependencies[name];

  if (typeof version === 'undefined') {
    console.error(chalk.red(`Missing ${name} dependency in package.json`));
    process.exit(1);
  }

  let patchedVersion = `^${version}`;

  if (!semver.validRange(patchedVersion)) {
    console.error(
      `Unable to patch ${name} dependency version because version ${chalk.red(
        version
      )} will become invalid ${chalk.red(patchedVersion)}`
    );
    patchedVersion = version;
  }

  dependencies[name] = patchedVersion;
}

// 检查发开依赖是否正确安装，版本是否正确

function setCaretRangeForRuntimeDeps(packageName) {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = require(packagePath);

  if (typeof packageJson.dependencies === 'undefined') {
    console.error(chalk.red('Missing dependencies in package.json'));
    process.exit(1);
  }

  const packageVersion = packageJson.dependencies[packageName];
  if (typeof packageVersion === 'undefined') {
    console.error(chalk.red(`Unable to find ${packageName} in package.json`));
    process.exit(1);
  }

  makeCaretRange(packageJson.dependencies, 'react');
  makeCaretRange(packageJson.dependencies, 'react-dom');

  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + os.EOL);
}
// 获取 https_proxy 
function getProxy() {
  if (process.env.https_proxy) {
    return process.env.https_proxy;
  } else {
    try {
      // Trying to read https-proxy from .npmrc
      let httpsProxy = execSync('npm config get https-proxy')
        .toString()
        .trim();
      return httpsProxy !== 'null' ? httpsProxy : undefined;
    } catch (e) {
      return;
    }
  }
}
// 检查是否网络异常
function checkIfOnline(useYarn) {
  if (!useYarn) {
    // Don't ping the Yarn registry.
    // We'll just assume the best case.
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    dns.lookup('registry.yarnpkg.com', err => {
      let proxy;
      if (err != null && (proxy = getProxy())) {
        // If a proxy is defined, we likely can't resolve external hostnames.
        // Try to resolve the proxy name as an indication of a connection.
        dns.lookup(url.parse(proxy).hostname, proxyErr => {
          resolve(proxyErr == null);
        });
      } else {
        resolve(err == null);
      }
    });
  });
}

function install(root, useYarn, dependencies, verbose, isOnline) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    if (useYarn) {
      command = 'yarnpkg';
      args = ['add', '--exact'];
      if (!isOnline) {
        args.push('--offline');
      }
      [].push.apply(args, dependencies);

      // Explicitly set cwd() to work around issues like
      // https://github.com/facebook/create-react-app/issues/3326.
      // Unfortunately we can only do this for Yarn because npm support for
      // equivalent --prefix flag doesn't help with this issue.
      // This is why for npm, we run checkThatNpmCanReadCwd() early instead.
      args.push('--cwd');
      args.push(root);

      if (!isOnline) {
        console.log(chalk.yellow('You appear to be offline.'));
        console.log(chalk.yellow('Falling back to the local Yarn cache.'));
        console.log();
      }
    } else {
      command = 'npm';
      args = [
        'install',
        '--save',
        '--save-exact',
        '--loglevel',
        'error',
      ].concat(dependencies);
    }

    if (verbose) {
      args.push('--verbose');
    }
    // 这里就把命令组合起来执行
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) { // code 为0代表正常关闭，不为零就打印命令执行错误的那条
        reject({
          command: `${command} ${args.join(' ')}`,
        });
        return;
      }
      resolve(); // 正常就返回一个promise 对象
    });
  });
}





