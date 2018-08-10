 
//  给命令行加颜色的小插件 chalk.blue('...'), chalk.red('...'), chalk.green('...'),chalk.yellow('...')...
var chalk = require('chalk');

var currentNodeVersion = process.version.node;// 返回node版本， 有多个版本显示多个

var semver = currentNodeVersion.split('.'); // 所有把node版本的集合

var major = semver[0];  // 取第一个node版本

// 如果当前版本低于4 提示信息，并推出进程
if(major < 4) {
  console.errror(chalk.red('你运行的node版本为' + currentNodeVersion + './n' +
    'Create React App 需要node 4 或者更高的版本，.\n'
    '请更新你的node版本'
  ))
  // 终止进程 1 是状态码 表示异常为处理， 如果不写，默认为0， 表示成功状态码，其他状态码用的时候可以查
  process.exit(1); 
}

// 检测成功之后引入下面文件执行
require('./createReactApp');
