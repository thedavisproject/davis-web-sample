const port = process.env.PORT || 9000;
const express = require('express');
const config = require('config');
const web = require('davis-web');
const core = require('davis-core');
const shared = require('davis-shared');
const { thread } = shared.fp;
const { createContainer, asValue, asFunction  } = require('awilix');
const cors = require('cors');
const { newRegistry, registerTypeFac, getType, getAllTypes } = web.graphql.typeRegistry;
const graphql = require('graphql');
const GraphQLDate = require('graphql-date');
const GraphQLJSON = require('graphql-type-json');
const graphqlHTTP = require('express-graphql');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { graphqlExpress, graphiqlExpress } = require('apollo-server-express');
const Queue = require('bull');
const path = require('path');
const Task = require('data.task');

const container = createContainer();

// Set up the job processing queue
const jobQueue = new Queue(config.jobQueue.name, config.jobQueue.config);

// Stick the 3rd parth graphql types on the graphql object
graphql.GraphQLDate = GraphQLDate;
graphql.GraphQLJSON = GraphQLJSON;

container.register({
  config              : asValue(config),
  storage             : asValue(require('davis-sql')(config.storage)),
  catalog             : asValue('web'),
  timeStamp           : asValue(require('davis-shared').time),
  userAuthentication  : asFunction(core.auth.user),

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
  expressErrorHandler : asFunction(web.expressErrorHandler),
  dataExport          : asFunction(web.dataExport),
  fileUploader        : asFunction(web.fileUploader),
  jobQueue            : asValue(jobQueue),

  middleware_authentication   : asFunction(web.middleware.authentication),

  // API Resolvers
  authorization_rules:
    asFunction(web.resolvers.authorization.rules),

  // Authentication resolver
  unprotected_resolver_authentication:
    asFunction(web.resolvers.authenticationResolver),
  resolver_authentication:
    asFunction(web.resolvers.authorization.authorizedAuthenticationResolver),

  // Data resolver
  unprotected_resolver_data:
    asFunction(web.resolvers.dataResolver),
  resolver_data:
    asFunction(web.resolvers.authorization.authorizedDataResolver),

  // Entity resolver
  unprotected_resolver_entity:
    asFunction(web.resolvers.entityResolver),
  resolver_entity:
    asFunction(web.resolvers.authorization.authorizedEntityResolver),

  // Job resolver
  unprotected_resolver_job:
    asFunction(web.resolvers.jobResolver),
  resolver_job:
    asFunction(web.resolvers.authorization.authorizedJobResolver),

  // Publish resolver
  unprotected_resolver_publish:
    asFunction(web.resolvers.publishResolver),
  resolver_publish:
    asFunction(web.resolvers.authorization.authorizedPublishResolver),

  // GraphQL Registry
  graphql                     : asValue(graphql),
  graphql_entity              : asFunction(web.graphql.model.entity),
  graphql_folder              : asFunction(web.graphql.model.folder),
  graphql_dataSet             : asFunction(web.graphql.model.dataSet),
  graphql_variable            : asFunction(web.graphql.model.variable),
  graphql_attribute           : asFunction(web.graphql.model.attribute),
  graphql_user                : asFunction(web.graphql.model.user),
  graphql_job                 : asFunction(web.graphql.model.job),
  graphql_entityQuery         : asFunction(web.graphql.entityQuery),
  graphql_data                : asFunction(web.graphql.model.data),
  graphql_import              : asFunction(web.graphql.model.import),
  graphql_dataQuery           : asFunction(web.graphql.dataQuery),
  graphql_publish             : asFunction(web.graphql.publish),
  graphql_authentication      : asFunction(web.graphql.authentication)
});

function buildGraphQLServer(container){

  const { gqlEntity } = container.resolve('graphql_entity');
  const { gqlFolder, gqlFolderCreate, gqlFolderUpdate } = container.resolve('graphql_folder');
  const { gqlDataSet, gqlDataSetCreate, gqlDataSetUpdate } = container.resolve('graphql_dataSet');
  const { gqlVariableTypeEnum, gqlVariable, gqlVariableCreate, gqlVariableUpdate } = container.resolve('graphql_variable');
  const { gqlAttribute, gqlAttributeCreate, gqlAttributeUpdate } = container.resolve('graphql_attribute');
  const { gqlUser, gqlUserCreate, gqlUserUpdate } = container.resolve('graphql_user');
  const { gqlJob, gqlJobQueries } = container.resolve('graphql_job');
  const { gqlFact,
          gqlCategoricalFact,
          gqlNumericalFact,
          gqlTextFact,
          gqlIndividual,
          gqlDataSetQueryResults,
          gqlDataImportColumnMapping
  } = container.resolve('graphql_data');
  const { gqlValueMatch,
          gqlVariableMatch } = container.resolve('graphql_import');

  const { gqlEntityQuery,
          gqlEntityCreate,
          gqlEntityUpdate,
          gqlEntityDelete,
          gqlEntityMutation } = container.resolve('graphql_entityQuery');
  const { gqlDataQueries, gqlDataMutation } = container.resolve('graphql_dataQuery');
  const { gqlPublish } = container.resolve('graphql_publish');
  const { gqlAuthentication } = container.resolve('graphql_authentication');

  const registry = thread(newRegistry(),
    // Authentication
    registerTypeFac(gqlAuthentication),
    // Entity Read
    registerTypeFac(gqlEntity),
    registerTypeFac(gqlFolder),
    registerTypeFac(gqlDataSet),
    registerTypeFac(gqlVariableTypeEnum),
    registerTypeFac(gqlVariable),
    registerTypeFac(gqlAttribute),
    registerTypeFac(gqlUser),
    registerTypeFac(gqlEntityQuery),
    registerTypeFac(gqlJob),
    registerTypeFac(gqlJobQueries),
    // Entity Create
    registerTypeFac(gqlFolderCreate),
    registerTypeFac(gqlDataSetCreate),
    registerTypeFac(gqlVariableCreate),
    registerTypeFac(gqlAttributeCreate),
    registerTypeFac(gqlUserCreate),
    // Entity Update
    registerTypeFac(gqlFolderUpdate),
    registerTypeFac(gqlDataSetUpdate),
    registerTypeFac(gqlVariableUpdate),
    registerTypeFac(gqlAttributeUpdate),
    registerTypeFac(gqlUserUpdate),
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
    registerTypeFac(gqlDataImportColumnMapping),
    // Import
    registerTypeFac(gqlValueMatch),
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
        authentication: { type: getType('Authentication', registry) , resolve: () => ({}) },
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

const authenticationMiddleware = container.resolve('middleware_authentication');

// Set up Express
const app = express();

// Initialize the context value in the request
app.use(web.middleware.initContext);

app.use(cors());

// Resolve the user's token
app.use(authenticationMiddleware);

// Register the uer with the DI container
app.use((req, res, next) => {
  req.scope = container.createScope();
  req.scope.register({
    user: asValue(req.context.user)
  });
  return next();
});

app.set('view engine', 'ejs'); // set up ejs for templating
app.set('views', path.resolve(__dirname, './views')); // set up the views directory

// create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({ extended: false });
app.use(urlencodedParser);

app.use(cookieParser());

// Express Endpoint
app.use('/graphql-express', (req, res, next) => {
  const gqlSchema = buildGraphQLServer(req.scope);

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

    const gqlSchema = buildGraphQLServer(req.scope);

    graphqlExpress({
      schema: gqlSchema,
      debug: true
    })(req, res, next);
  });


const AUTH_COOKIE = 'graphql-token';

// GraphiQL IDE
app.use('/graphiql', (req, res, next) => {

  const {userByToken} = req.scope.resolve('userAuthentication');

  const token = req.cookies[AUTH_COOKIE];

  userByToken(token).fork(
    () => {
      res.render('login', { message: '' });
    },
    () => {
      graphiqlExpress({
        endpointURL: '/graphql',
        passHeader: `'Authorization': 'Bearer ${token}'`
      })(req, res, next);
    });
});


app.post('/graphiql-login', (req, res) => {
  const { email, password } = req.body;

  const { login } = req.scope.resolve('userAuthentication');
  login(email, password)
    .fork(
      error => {
        res.render('login', { message: error});
      },
      token => {
        res.cookie(AUTH_COOKIE, token)
          .redirect('/graphiql');
      }
    );
});

const upload = require('multer')({
  dest: config.upload.path
});

// Attach the file uploader route
const fileUploadHandler = (req, res, next) => {
  const fileUpload = req.scope.resolve('fileUploader');
  fileUpload(req, res, next);
};

app.post('/upload', upload.any(), fileUploadHandler);

// Attach the data exporter
const exportHandler = (req, res, next) => {
  const dataExport = req.scope.resolve('dataExport');
  dataExport(req, res, next);
};

app.get('/export', exportHandler);
app.get(`/export/:dataSetIds`, exportHandler);

app.get('/', function(req, res){
  res.send('Welcome to Davis!');
});

// Kick off the job queue processors. This does not need to run within the same server process!
// If needed, this could be extracted to a separate node service and even run in parallel on multiple
// machines/threads.
const getJobScope = (job) => {

  if(!job.data.userId){
    return Task.rejected('Job is missing user data')
  }

  const {userById} = container.resolve('userAuthentication');

  return userById(job.data.userId)
    .map(user => {

      const jobScope = container.createScope();

      jobScope.register({
        user: asValue(user)
      });

      return jobScope;
    });
};

jobQueue.process(core.jobs.jobTypes.import, (job, done) => {
  getJobScope(job).fork(
    error => done(new Error(error)),
    scope => {
      const importJob = scope.resolve('importJob');
      importJob.processor(job, done);
    });
});

jobQueue.process(core.jobs.jobTypes.publish, (job, done) => {
  getJobScope(job).fork(
    error => done(new Error(error)),
    scope => {
      const publishJob = scope.resolve('publishJob');
      publishJob.processor(job, done);
    });
});

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

app.listen(port, function(){
  console.log(`Davis server started on port ${port}`);
});
