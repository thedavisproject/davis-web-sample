const port = process.env.PORT || 9000;
const express = require('express');
const config = require('config');
const app = express();
const web = require('davis-web');
const core = require('davis-core');
const { createContainer  } = require('awilix');
const { scopePerRequest } = require('awilix-express');

const container = createContainer();

app.use(scopePerRequest(container));

container.registerFunction({
  csvExport           : core.data.export.csvExport,
  dataAnalyze         : core.data.import.dataAnalyze,
  individualGenerator : core.data.import.individualGenerator,
  dataImport          : core.data.import.dataImport,
  dataDelete          : core.data.dataDelete,
  dataQuery           : core.data.dataQuery,
  entityRepository    : core.entities.entityRepository,
  publish             : core.publish,
  graphQL             : web.graphQL
});

container.registerValue({
  storage: require('davis-sql')(config.db),
  catalog: 'web',
  timeStamp: require('davis-shared').time,
  user: { id: 25 } // TODO: Stub for now
});

const gqlserver = container.resolve('graphQL').server;
app.use('/graphql', gqlserver);

app.get('/', function(req, res){
  res.send('Welcome to Davis! This route doesn\'t do anything...');
});

app.listen(port, function(){
  console.log(`Davis server started on port ${port}`);
});
