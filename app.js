const auth = require('./auth');
const express = require('express');
const path = require('path');
const fs = require('fs');
const disk = require('diskusage');
const os = require('os');
const ffmpeg = require('ffmpeg-static');
const chalk = require('chalk');
const pretty = require('prettysize');
const NodeMediaServer = require('node-media-server');
const recursive = require("recursive-readdir");

let root_path = os.platform() === 'win32' ? 'c:' : '/';
const video_path = './public/media/live/';

// Init App
const app = express();
app.use(auth);


app.set('port', 3000);

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 60,
    ping_timeout: 30
  },
  http: {
    port: 8000,
    webroot: './public',
    mediaroot: './public/media',
    allow_origin: '*'
  },
  trans: {
    ffmpeg: ffmpeg.path,
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        mp4: true,
        mp4Flags: '[movflags=faststart]',
      }
    ]
  }
};

var nms = new NodeMediaServer(config);
nms.run();


// Load View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Set Public Folder
app.use('/', express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));
app.use('/js', express.static(path.join(__dirname, 'node_modules/popper.js/dist/umd'), { maxAge: 31557600000 }));
app.use('/js', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js'), { maxAge: 31557600000 }));
app.use('/js', express.static(path.join(__dirname, 'node_modules/jquery/dist'), { maxAge: 31557600000 }));
app.use('/js', express.static(path.join(__dirname, 'node_modules/clappr/dist'), { maxAge: 31557600000 }));
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css'), { maxAge: 31557600000 }));
app.use('/css', express.static(path.join(__dirname, 'node_modules/@fortawesome/fontawesome-free/css'), { maxAge: 31557600000 }));
app.use('/webfonts', express.static(path.join(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts'), { maxAge: 31557600000 }));


function get_state(disk_percent) {
  if(disk_percent > 80){
    return 'bg-danger';
  }
  else if(disk_percent > 50)
    return 'bg-warning';
  else{
    return '';
  }
}

app.get('/', (req, res) => {
  var streamkeys = [];
  recursive(video_path, (err, files) => {
    files.forEach(file => {
      if(file.includes('.mp4') || file.includes('.m3u8')){
        var key = (file.split('/')[file.split('/').length-2]);
        if(!streamkeys.includes(key)){
          streamkeys.push(key);}
      }
    });
    streamkeys = streamkeys.sort();
    var streams = [];
    streamkeys.forEach(stream => {
      if(fs.existsSync(video_path+'/'+stream+'/index.m3u8')){
        streams.push([stream, true]);
      }  
      else{
        streams.push([stream, false]);
      }
    });
    var disk_percent = 0;
    disk.check(root_path, function (err, info) {
      if (err) {
        console.log(err);
      } else {
        disk_free = info.free;
        disk_total = info.total;
        disk_percent = Math.round(((disk_total - disk_free) / disk_total) * 100);
      }
    });
    res.render('index', {
      streams: streams,
      disk: disk_percent,
      disk_total: pretty(disk_total),
      disk_used: pretty(disk_total - disk_free),
      state: get_state(disk_percent)
    });
  });
});


app.get('/streams/:key', (req, res) => {
  let videos = [];
  recursive(video_path + req.params.key, (err, files) => {
    files.forEach(file => {
      if(file.includes('.mp4')){
        video = {};
        video.path = file;
        video.name = file.split('/')[file.split('/').length - 1].slice(0,-4);
        video.streamkey = file.split('/')[file.split('/').length-2];
        videos.push(video);
      }
    });
      var live = false;
      if(fs.existsSync(video_path+'/'+req.params.key+'/index.m3u8')){
        live = true;
      }  

    res.render('videos', {
      videos: videos.sort().reverse(),
      stream: req.params.key,
      live: live
    });
});
});

app.get('/video/:key/:id', (req, res) => {
  const video = '/media/live/' + req.params.key + '/' + req.params.id;
  res.render('video', {
    title: req.params.id,
    stream: req.params.key,
    video_path: video+'.mp4',
    video: req.params.id
  });
});

app.get('/live/:key', (req, res) => {
  res.render('live', {
    playback_url: 'http://'+req.headers.host.split(':')[0]+':'+config.http.port+'/live/'+req.params.key+'/index.m3u8',
    stream: req.params.key,
  });
});

var resultHandler = function (err) {
  if (err) {
    console.log("unlink failed", err);
  } else {
    console.log("file deleted");
  }
};

app.get('/video/:key/delete/:id', (req, res) => {
  const delete_path = video_path + req.params.key + '/' + req.params.id + '.mp4';
  fs.unlink(delete_path, resultHandler);
  res.redirect('/');
});

// Start Server
app.listen(app.get('port'), function(){
  console.log('%s App is running at http://localhost:%d in ', chalk.green('✓'), app.get('port'));
  console.log('  Press CTRL-C to stop\n');});
