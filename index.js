const fs = require('fs');
const PromiseFtp = require('promise-sftp');
const readline = require('readline');
const ftpConfig = require('./ftpConfig');
const player = require('play-sound')(opts = {});

console.log('\x1Bc');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ftp = new PromiseFtp();
const moviePromises = [];

const finish = (msg, y=0) => {
  readline.cursorTo(process.stdout, 0, y);
  process.stdout.write(`${msg}\n`);
  rl.close();
  ftp.logout();
};

const byteScaler = (x, b) => (x.toFixed(2)/Math.pow(10,b)).toFixed(2);

const scaleBytes = bytes => {
  if (bytes === Infinity) return 'Infinity!'

  if (bytes >= Math.pow(10, 12)){ // if bigger than a terabyte
    return `${byteScaler(bytes, 12)}TB`
  } else if (bytes >= Math.pow(10, 9)){// if bigger than a gigabyte
    return `${byteScaler(bytes, 9)}GB`
  } else if (bytes >= Math.pow(10, 6)){// if bigger than a megabyte
    return `${byteScaler(bytes, 6)}MB`
  } else if (bytes >= Math.pow(10, 3)){// if bigger than a kilobyte
    return `${byteScaler(bytes, 3)}KB`
  } else { // else its just a byte
    return `${bytes}B`
  }
};

const secToMin = sec => sec > 60 ? `${Math.floor(sec/60)}m ${Math.floor(sec % 60)}` : sec;

const leadZero = num => num < 10 ? `0${num}` : num;

const justTime = date => `${leadZero(date.getHours())}:${leadZero(date.getMinutes())}:${leadZero(date.getSeconds())}`;

const truncate = (name, len) => name.length > len ? `${name.substring(0,len)}...` : name;

const plauralize = (num, noun) => `${num} ${num === 1 ? noun : noun + 's'}`;

(async () => {
  const remotePath = '/media/pi/wd/Movies';
  let totalSize = 0;
  try {
    const opened = new Date();

    await ftp.connect(ftpConfig);
    readline.cursorTo(process.stdout, 0, 0);
    process.stdout.write(`${justTime(new Date())} ::: Connected to ${ftpConfig.host} in ${((new Date() - opened) / 1000).toFixed(2)}s`);

    const files = fs.readdirSync('./localmovies').filter(x => !/^\..*/.test(x));
    if (!files.length) return finish('nothing to move!', 1);

    const start = new Date();

    files.forEach(async (file, idx) => {
      let lastSec = start,
          chunksLastSec = 0,
          currentTransferRate = 0,
          size;

      const speeds = [];
      const localPathToFile = `${__dirname}/localmovies/${file}`;

      const put = ftp.fastPut(localPathToFile, `${remotePath}/${file}`, {
        concurrency: 50,
        step: async (transferred, chunk, total) => {
          size = total;

          const rightNow = new Date();
          const percent = (transferred/total * 100).toFixed(2);
          const avgTransferRate = ((transferred) / ((rightNow - start) / 1000));

          if (rightNow.getSeconds() == lastSec.getSeconds()){
            chunksLastSec += chunk;
          } else {
            currentTransferRate = chunksLastSec;
            speeds.push(currentTransferRate);
            chunksLastSec = 0
            lastSec = new Date();
          }

          const secsRemain = ((total - transferred) / currentTransferRate).toFixed(1);

          readline.cursorTo(process.stdout, 0, idx+1);
          process.stdout.clearLine();
          process.stdout.write(`moving ${truncate(file, 15)} ${percent}% of ${scaleBytes(total)}\t${scaleBytes(currentTransferRate)}ps (${scaleBytes(avgTransferRate)}ps avg)\t${secToMin(secsRemain)}s`);
        }
      });

      moviePromises.push(put);
      put.then(() => {
        player.play('alert.mp3');
        totalSize += size;

        const maxTransfer = Math.max(...speeds);
        const done = new Date();
        const secs = ((done - start)/1000).toFixed(2);
        const totalAverageTransferRate = (size / secs);

        readline.cursorTo(process.stdout, 0, idx+1);
        process.stdout.clearLine();
        process.stdout.write(`${justTime(done)} ::: moved ${truncate(file, 15)} successfully ${secToMin(secs)}s (${scaleBytes(size)} @ ${scaleBytes(totalAverageTransferRate)}ps :: ${scaleBytes(maxTransfer)}ps max). deleting locally...`);
        fs.unlinkSync(localPathToFile);
      }).catch(console.log);
    });

    Promise.all(moviePromises)
      .then(() => {

        const finallyDone = new Date();
        const finallySec = ((finallyDone - start) / 1000).toFixed(2)

        finish(`${justTime(finallyDone)} ::: all done! moved ${plauralize(files.length, 'file')} ${secToMin(finallySec)}s (${scaleBytes(totalSize)} @ ${scaleBytes(totalSize / finallySec)}ps)`, files.length+1);
      });

  } catch(err) {
    finish(err);
  }
})();
