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
const GraphQLUnionInputType = require('graphql-union-input-type');
const graphqlHTTP = require('express-graphql');

//const passport = require('passport');

const container = createContainer();

app.use(cors());

//app.use(passport.initialize());
app.use(scopePerRequest(container));

// Stick the 3rd parth graphql types on the graphql object
graphql.GraphQLDate = GraphQLDate;
graphql.GraphQLJSON = GraphQLJSON;
graphql.GraphQLUnionInputType = GraphQLUnionInputType;

container.register({
  csvExport           : asFunction(core.data.export.csvExport),
  dataAnalyze         : asFunction(core.data.import.dataAnalyze),
  individualGenerator : asFunction(core.data.import.individualGenerator),
  dataImport          : asFunction(core.data.import.dataImport),
  csvParse            : asValue(core.data.import.parse.csvParser),
  dataDelete          : asFunction(core.data.dataDelete),
  dataQuery           : asFunction(core.data.dataQuery),
  entityRepository    : asFunction(core.entities.entityRepository),
  publish             : asFunction(core.publish),
  fileUploader        : asFunction(web.fileUploader),
  config              : asValue(config),
  storage             : asValue(require('davis-sql')(config.db)),
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
  graphql_entityQuery         : asFunction(web.graphql.entityQuery),
  graphql_data                : asFunction(web.graphql.model.data),
  graphql_import              : asFunction(web.graphql.model.import),
  graphql_dataQuery           : asFunction(web.graphql.dataQuery)
});

function buildGraphQLServer(container){

  const { gqlEntity, gqlEntityCreate, gqlEntityUpdate } = container.resolve('graphql_entity');
  const { gqlFolder, gqlFolderCreate, gqlFolderUpdate } = container.resolve('graphql_folder');
  const { gqlDataSet, gqlDataSetCreate, gqlDataSetUpdate } = container.resolve('graphql_dataSet');
  const { gqlVariable, gqlVariableCreate, gqlVariableUpdate } = container.resolve('graphql_variable');
  const { gqlAttribute, gqlAttributeCreate, gqlAttributeUpdate } = container.resolve('graphql_attribute');
  const { gqlFact,
          gqlCategoricalFact,
          gqlQuantitativeFact,
          gqlIndividual,
          gqlDataSetQueryResults } = container.resolve('graphql_data');
  const { gqlAttributeMatch,
          gqlVariableMatch } = container.resolve('graphql_import');

  const { gqlEntityQuery, gqlEntityMutation } = container.resolve('graphql_entityQuery');
  const { gqlDataQuery, gqlDataAnalyze } = container.resolve('graphql_dataQuery');

  const registry = thread(newRegistry(),
    // Entity Read
    registerTypeFac(gqlEntity),
    registerTypeFac(gqlFolder),
    registerTypeFac(gqlDataSet),
    registerTypeFac(gqlVariable),
    registerTypeFac(gqlAttribute),
    registerTypeFac(gqlEntityQuery),
    // Entity Create
    registerTypeFac(gqlEntityCreate),
    registerTypeFac(gqlFolderCreate),
    registerTypeFac(gqlDataSetCreate),
    registerTypeFac(gqlVariableCreate),
    registerTypeFac(gqlAttributeCreate),
    // Entity Update
    registerTypeFac(gqlEntityUpdate),
    registerTypeFac(gqlFolderUpdate),
    registerTypeFac(gqlDataSetUpdate),
    registerTypeFac(gqlVariableUpdate),
    registerTypeFac(gqlAttributeUpdate),
    registerTypeFac(gqlEntityMutation),
    // Data
    registerTypeFac(gqlFact),
    registerTypeFac(gqlCategoricalFact),
    registerTypeFac(gqlQuantitativeFact),
    registerTypeFac(gqlIndividual),
    registerTypeFac(gqlDataSetQueryResults),
    // Import
    registerTypeFac(gqlAttributeMatch),
    registerTypeFac(gqlVariableMatch)
  );

  const schema = new graphql.GraphQLSchema({
    types: getAllTypes(registry),
    query: new graphql.GraphQLObjectType({
      name: 'Query',
      fields: {
        entities: { type: getType('EntityQuery', registry) , resolve: () => ({}) },
        data: gqlDataQuery(registry),
        analyze: gqlDataAnalyze(registry)
      }
    }),
    mutation: new graphql.GraphQLObjectType({
      name: 'Mutation',
      fields: {
        entities: { type: getType('EntityMutation', registry), resolve: () => ({}) }
      }
    })
  });

  return schema;
}

app.use('/graphql', (req, res) => {
  const gqlSchema = buildGraphQLServer(container);

  // Delegate to graphqlHTTP
  graphqlHTTP({
    schema: gqlSchema,
    graphiql: true
  })(req, res);
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
