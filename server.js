const port = process.env.PORT || 9000;
const express = require('express');
const config = require('config');
const app = express();
const web = require('davis-web');
const core = require('davis-core');
const { createContainer, asValue, asFunction  } = require('awilix');
const { scopePerRequest } = require('awilix-express');
const cors = require('cors');
//const passport = require('passport');

const container = createContainer();

app.use(cors());

//app.use(passport.initialize());
app.use(scopePerRequest(container));

container.register({
  csvExport           : asFunction(core.data.export.csvExport),
  dataAnalyze         : asFunction(core.data.import.dataAnalyze),
  individualGenerator : asFunction(core.data.import.individualGenerator),
  dataImport          : asFunction(core.data.import.dataImport),
  dataDelete          : asFunction(core.data.dataDelete),
  dataQuery           : asFunction(core.data.dataQuery),
  entityRepository    : asFunction(core.entities.entityRepository),
  publish             : asFunction(core.publish),
  graphQL             : asFunction(web.graphQL),
  fileUploader        : asFunction(web.fileUploader),
  entityLoaderFactory : asFunction(web.entityLoaderFactory).singleton(),
  config              : asValue(config),
  storage             : asValue(require('davis-sql')(config.db)),
  catalog             : asValue('web'),
  timeStamp           : asValue(require('davis-shared').time),
  user                : asValue({ id: 25 }) // TODO : Stub for now
});

app.use('/graphql', (req, res) => {
  const gqlserver = container.resolve('graphQL').server;
  gqlserver(req, res);
});

// Attach the file uploader route
const fileUploader = container.resolve('fileUploader');
fileUploader('/upload', app);

app.get('/', function(req, res){
  res.send('Welcome to Davis!');
});

app.listen(port, function(){
  console.log(`Davis server started on port ${port}`);
});
