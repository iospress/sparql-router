import http from 'http'
import slug from 'slug'
import https from 'https'
import functions from './functions.js'
import sparqljs from 'sparqljs'

// An action will receive the store as the first argument.
// Since we are only interested in the dispatch (and optionally the state)
// we can pull those two parameters using the ES6 destructuring feature


export const getQueryMetadata = function (store,type,name) {

  var queryType = encodeURIComponent("router:" + functions.capitalizeFirst(type) + "Query");
  var url = siteRootUrl + "/api/graphs/query-metadata.jsonld?$name=%22" + name + "%22&queryType=" + queryType;
  var scheme = {};
  var resultObject = {};
  if (app.config.public.scheme === 'https') {scheme = https} else {scheme = http};

  var req = scheme.get(url, (res) => {
      var result = "";
      res.setEncoding('utf8');
      res.on('data', (data) => {
        result += data;
      });
      res.on('end',function() {
        resultObject = JSON.parse(result);
        var query = {};
        query.name = resultObject.label || resultObject["rdfs:label"];
        query.author = resultObject.author || resultObject["dct:author"];
        query.endpoint = resultObject.endpoint || resultObject["router:endpoint"];
        query.modificationDate = resultObject.modificationDate || resultObject["dct:modificationDate"];

        // Get the query text
        scheme.get(siteRootUrl + "/api/" + type + "/" + name + ".rq", (res2) => {
          var result = "";
          res2.on('data', (chunk) => {
            result += chunk;
            query.query = result;
            store.dispatch('QUERY', query);
           });
        });
      });
  });
  req.on('error', (e) => {
    console.log('Error: problem getting query metadata: ' + e.message);
    store.dispatch('MESSAGE', "Request failed",true);
  });
  req.end();
}

export const updateQuery = function (store,query) {
  store.dispatch('QUERY', query);
}

export const updateForm = function (store,form) {
  store.dispatch('FORM', form);
}

export const saveQuery = function (store,query,form) {
  var callback = function (store,res,result) {
    if (res.statusCode < 300) {
      store.dispatch('MESSAGE',"Query saved successfully.",false);
      } else {
      result = result.replace(/(?:\r\n|\r|\n)/g, '<br />').replace(/\t/g,'  ');
      store.dispatch('MESSAGE',result,true);
    }
  };
  module.exports.writeQuery(store,query,form,callback);
}

export const createQuery = function (store,query,form,router) {
  var callback = function (store,res,result) {
    if (res.statusCode < 300) {
      store.dispatch('MESSAGE',"Query created successfully.",false);
      router.go({name: 'edit', params : {
        type: form.type,
        slug: form.slug
      }});
      } else {
      result = result.replace(/(?:\r\n|\r|\n)/g, '<br />').replace(/\t/g,'  ');
      store.dispatch('MESSAGE',result,true);
    }
  };
  module.exports.writeQuery(store,query,form,callback);
}

export const writeQuery = function (store,query,form,cb) {
  var options = {
    data: query,
    scheme : app.config.public.scheme,
    hostname: app.config.public.hostname,
    port: app.config.public.port,
    path: "/api/" + form.type + "/" + form.slug,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Accept" : "*/*"
    }
  };

  module.exports.sendHTTPRequest(store,options,cb);
}

export const deleteQuery = function (store,slug,type,router) {
  var callback = function (store,res,result) {
    if (res.statusCode < 300) {
      store.dispatch('MESSAGE',"Query deleted successfully: " + form.type + "/" + form.slug,false);
      router.go({name: 'new'});
      } else {
      result = result.replace(/(?:\r\n|\r|\n)/g, '<br />').replace(/\t/g,'  ');
      store.dispatch('MESSAGE',result,true);
    }
  };
  var options = {
      scheme : app.config.public.scheme,
      hostname: app.config.public.hostname,
      port: app.config.public.port,
      path: "/api/" + form.type + "/" + form.slug,
      method: "DELETE"
    }
    module.exports.sendHTTPRequest(store,options,callback);
};

export const testQuery = function (store,query,type) {
  var accept = (type === "tables") ? "application/sparql-results+json" : "text/turtle; q=0.2, application/ld+json";
  var options = {
    data: {
      query: query.query,
      endpoint: query.endpoint
    },
    scheme : app.config.public.scheme,
    hostname: app.config.public.hostname,
    port: app.config.public.port,
    path: "/api/sparql",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "accept" : accept
    }
  };
  module.exports.sendHTTPRequest(store,options,module.exports.getQueryResults);
};

export const sendHTTPRequest = function (store, options,cb) {
  var data = (options.method != "GET" && options.data) ? options.data : "";
  var scheme = {};
  var result = "";
  if (options.scheme === 'https') {scheme = https} else {scheme = http};

  var start = new Date();
  start = start.setDate(start.getDate());

  store.dispatch('LOADING',true);

  var req = scheme.request(options, (res) => {
      res.setEncoding('utf8');
      res.on('data', (data) => {
        result += data;
      });
      res.on('end', () => {
          store.dispatch('LOADING',false);
          var end = new Date();
          end = end.setDate(end.getDate());
          store.dispatch('ELAPSEDTIME',(end - start)/1000);
          cb(store,res,result);
      })
    });
    req.on('error', (e) => {
        throw new Error ("There was an error sending the form data: " + e.message + ".\n");
    });
    req.write(JSON.stringify(data));
    req.end();
};


export const getQueryResults = function (store,res, result) {
  var queryResults = {};
  if (res.statusCode < 300 || res.statusCode === 304) {
    queryResults.type = functions.stringBefore(res.headers["content-type"],';').replace(' ','');

    if (/json/.test(queryResults.type)) {
      queryResults.data = JSON.parse(result);
      store.dispatch('RESULTS',queryResults);
      store.dispatch('MESSAGE',"",false);
    } else {
      var now = new Date();
      now = now.toString();
      result = now + "\n" + result.replace(/(?:\r\n|\r|\n)/g, '<br />').replace(/\t/g,'  ');
      store.dispatch('MESSAGE',result,false);
    }
  } else {
    result = result.replace(/(?:\r\n|\r|\n)/g, '<br />').replace(/\t/g,'  ');
    store.dispatch('MESSAGE',result,true);
  }
};

export const setQueryType = function(store,form,query) {
  var SparqlParser =  sparqljs.Parser;
  var parser = new SparqlParser();
  form.type = "";
  console.log("query: " + query);
  var queryObject = parser.parse(query);
  var queryType = queryObject.queryType;

  if (queryType === "SELECT") {
    form.type = "tables";
  } else if (queryType === "DESCRIBE" || queryType === "CONSTRUCT" || queryType === "DESCRIBE" ){
    form.type = "graphs";
  }
  store.dispatch('FORM',form);
};

export const initStore = function(store) {
  const query = {
    query: "",
    name: "",
    author: "",
    endpoint: ""
  };
  const results = {
    data: {},
    type: ""
  };
  const form = {
    slug: "",
    type: "tables"
  };

  store.dispatch('FORM', form);
  store.dispatch('QUERY', query);
  store.dispatch('RESULTS', results);
  store.dispatch('SHOWDETAILS', false);
  store.dispatch('ELAPSEDTIME', 0);
};

export const showDetails = function (store,show,view) {
  if (view != "view") {
    var newShow = false;
  } else {
    var newShow = !show;
  }
  store.dispatch('SHOWDETAILS',newShow);
};
