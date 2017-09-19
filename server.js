const port = process.env.PORT || 9000;
const express = require('express');
const config = require('config');
const app = express();
const web = require('davis-web');
const core = require('davis-core');
const shared = require('davis-shared');
const { thread } = shared.fp;
const { createContainer, asValue, asFunction  } = require('awilix');
const { scopePerRequest } = require('awilix-express');
const cors = require('cors');
const { newRegistry, registerTypeFac, getType, getAllTypes } = web.graphql.typeRegistry;
const graphql = require('graphql');
const GraphQLDate = require('graphql-date');
const GraphQLJSON = require('graphql-type-json');
const graphqlHTTP = require('express-graphql');
const bodyParser = require('body-parser');
const { graphqlExpress, graphiqlExpress } = require('apollo-server-express');
const Queue = require('bull');

//const passport = require('passport');

const container = createContainer();

app.use(cors());

//app.use(passport.initialize());
app.use(scopePerRequest(container));

// Set up the job processing queue
const jobQueue = new Queue(config.jobQueue.name, config.jobQueue.config);

// Stick the 3rd parth graphql types on the graphql object
graphql.GraphQLDate = GraphQLDate;
graphql.GraphQLJSON = GraphQLJSON;

container.register({
  csvExport           : asFunction(core.data.export.csvExport),
  dataAnalyze         : asFunction(core.data.import.dataAnalyze),
  individualGenerator : asFunction(core.data.import.individualGenerator),
  dataImport          : asFunction(core.data.import.dataImport),
  parseDataFile       : asValue(core.data.import.parse.csvParser),
  dataDelete          : asFunction(core.data.dataDelete),
  dataQuery           : asFunction(core.data.dataQuery),
  entityRepository    : asFunction(core.entities.entityRepository),
  publish             : asFunction(core.publish),
  importJob           : asFunction(core.jobs.importJob),
  publishJob          : asFunction(core.jobs.publishJob),
  fileUploader        : asFunction(web.fileUploader),
  expressErrorHandler : asFunction(web.expressErrorHandler),
  dataExport          : asFunction(web.dataExport),
  config              : asValue(config),
  jobQueue            : asValue(jobQueue),
  storage             : asValue(require('davis-sql')(config.storage)),
  catalog             : asValue('web'),
  timeStamp           : asValue(require('davis-shared').time),
  user                : asValue({ id: 25 }), // TODO : Stub for now

  // GraphQL Registry
  graphql                     : asValue(graphql),
  graphql_entityLoaderFactory : asFunction(web.graphql.entityLoaderFactory).singleton(),
  graphql_entityResolver      : asFunction(web.graphql.entityResolver),
  graphql_entity              : asFunction(web.graphql.model.entity),
  graphql_folder              : asFunction(web.graphql.model.folder),
  graphql_dataSet             : asFunction(web.graphql.model.dataSet),
  graphql_variable            : asFunction(web.graphql.model.variable),
  graphql_attribute           : asFunction(web.graphql.model.attribute),
  graphql_job                 : asFunction(web.graphql.model.job),
  graphql_entityQuery         : asFunction(web.graphql.entityQuery),
  graphql_data                : asFunction(web.graphql.model.data),
  graphql_import              : asFunction(web.graphql.model.import),
  graphql_dataQuery           : asFunction(web.graphql.dataQuery),
  graphql_publish             : asFunction(web.graphql.publish)
});

// Kick off the job queue processors. This does not nave to run within the same server process!
// If needed, this could be extracted to a separate node service and even run in parallel on multiple
// machines/threads if needed.
const importJob = container.resolve('importJob');
jobQueue.process(importJob.jobType, importJob.processor);
const publishJob = container.resolve('publishJob');
jobQueue.process(publishJob.jobType, publishJob.processor);

const log = notice => data => {
  console.log(notice, `Job # ${data.id}`);
};

jobQueue.on('error', log('Queue Error'));
jobQueue.on('active', log('Queue Active'));
jobQueue.on('stalled', log('Queue Stalled'));
jobQueue.on('progress', log('Queue Progress'));
jobQueue.on('completed', log('Queue Completed'));
jobQueue.on('failed', log('Queue Failed'));
jobQueue.on('paused', log('Queue Paused'));
jobQueue.on('resumed', log('Queue Resumed'));
jobQueue.on('cleaned', log('Queue Cleaned'));

function buildGraphQLServer(container){

  const { gqlEntity } = container.resolve('graphql_entity');
  const { gqlFolder, gqlFolderCreate, gqlFolderUpdate } = container.resolve('graphql_folder');
  const { gqlDataSet, gqlDataSetCreate, gqlDataSetUpdate } = container.resolve('graphql_dataSet');
  const { gqlVariableTypeEnum, gqlVariable, gqlVariableCreate, gqlVariableUpdate } = container.resolve('graphql_variable');
  const { gqlAttribute, gqlAttributeCreate, gqlAttributeUpdate } = container.resolve('graphql_attribute');
  const { gqlJob, gqlJobQueries } = container.resolve('graphql_job');
  const { gqlFact,
          gqlCategoricalFact,
          gqlNumericalFact,
          gqlTextFact,
          gqlIndividual,
          gqlDataSetQueryResults } = container.resolve('graphql_data');
  const { gqlAttributeMatch,
          gqlVariableMatch } = container.resolve('graphql_import');

  const { gqlEntityQuery, 
          gqlEntityCreate,
          gqlEntityUpdate,
          gqlEntityDelete,
          gqlEntityMutation } = container.resolve('graphql_entityQuery');
  const { gqlDataQueries, gqlDataMutation } = container.resolve('graphql_dataQuery');
  const { gqlPublish } = container.resolve('graphql_publish');

  const registry = thread(newRegistry(),
    // Entity Read
    registerTypeFac(gqlEntity),
    registerTypeFac(gqlFolder),
    registerTypeFac(gqlDataSet),
    registerTypeFac(gqlVariableTypeEnum),
    registerTypeFac(gqlVariable),
    registerTypeFac(gqlAttribute),
    registerTypeFac(gqlEntityQuery),
    registerTypeFac(gqlJob),
    registerTypeFac(gqlJobQueries),
    // Entity Create
    registerTypeFac(gqlFolderCreate),
    registerTypeFac(gqlDataSetCreate),
    registerTypeFac(gqlVariableCreate),
    registerTypeFac(gqlAttributeCreate),
    // Entity Update
    registerTypeFac(gqlFolderUpdate),
    registerTypeFac(gqlDataSetUpdate),
    registerTypeFac(gqlVariableUpdate),
    registerTypeFac(gqlAttributeUpdate),
    registerTypeFac(gqlEntityCreate),
    registerTypeFac(gqlEntityUpdate),
    registerTypeFac(gqlEntityDelete),
    registerTypeFac(gqlEntityMutation),
    // Data
    registerTypeFac(gqlFact),
    registerTypeFac(gqlCategoricalFact),
    registerTypeFac(gqlNumericalFact),
    registerTypeFac(gqlTextFact),
    registerTypeFac(gqlIndividual),
    registerTypeFac(gqlDataSetQueryResults),
    // Import
    registerTypeFac(gqlAttributeMatch),
    registerTypeFac(gqlVariableMatch),
    registerTypeFac(gqlDataQueries),
    registerTypeFac(gqlDataMutation),
    // Publish
    registerTypeFac(gqlPublish)
  );

  const schema = new graphql.GraphQLSchema({
    types: getAllTypes(registry),
    query: new graphql.GraphQLObjectType({
      name: 'Query',
      fields: {
        entities: { type: getType('EntityQuery', registry) , resolve: () => ({}) },
        data: { type: getType('DataQuery', registry), resolve: () => ({}) },
        job: { type: getType('JobQuery', registry), resolve: () => ({}) }
      }
    }),
    mutation: new graphql.GraphQLObjectType({
      name: 'Mutation',
      fields: {
        entities: { type: getType('EntityMutation', registry), resolve: () => ({}) },
        data: { type: getType('DataMutation', registry), resolve: () => ({}) },
        publish: { type: getType('Publish', registry), resolve: () => ({}) },
      }
    })
  });

  return schema;
}

// Express Endpoint
app.use('/graphql-express', (req, res, next) => {
  const gqlSchema = buildGraphQLServer(container);

  // Delegate to graphqlHTTP
  graphqlHTTP({
    schema: gqlSchema,
    graphiql: true
  })(req, res, next);
});
  
// Apollo GraphQL Endpoint
app.use('/graphql', 
  bodyParser.json(),
  (req, res, next) => {

    const gqlSchema = buildGraphQLServer(container);

    graphqlExpress({
      schema: gqlSchema,
      debug: true
    })(req, res, next);
  });

// GraphiQL IDE
app.use('/graphiql', graphiqlExpress({ endpointURL: '/graphql' }));

// Attach the file uploader route
const fileUploader = container.resolve('fileUploader');
fileUploader('/upload', app);

// Attach the data exporter
const dataExport = container.resolve('dataExport');
dataExport('/export', app);

app.get('/', function(req, res){
  res.send('Welcome to Davis!');
});

app.listen(port, function(){
  console.log(`Davis server started on port ${port}`);
});
