var express = require('express');
var db = require('../db');
const proxy = require("express-http-proxy");
const urlHelper = require("../utils/urlHelper");
const stringHelper = require("../utils/stringHelper");
const qm = require("../../fdai/public/app/public/js/qmHelpers");
let credentials = require('../utils/credentials');
const authHelper = require("../utils/authHelper");
const expressAccessToken = require('express-access-token');

let unauthorizedResponse = {
  "error": "Unauthorized",
  "message": "You are not authorized to access this resource.",
  "status": 401
};
function handleUnauthorizedRequest(req, res){
  if(req.path.startsWith("/api")){
    return res.status(403).send("Forbidden");
  } else {
    return res.redirect("/login");
  }
}
//Use the req.isAuthenticated() function to check if user is Authenticated
checkAuthenticated = async (req, res, next) => {
  //debugger
  let authorized = req.isAuthenticated();
  let user = req.user
  if(!user){
    let accessToken = authHelper.getAccessTokenFromRequest(req);
    if(accessToken){
      user = await authHelper.findUserByAccessToken(accessToken);
      if(user){req.session.user = req.user = user;}
    }
  }
  if(!user){
    return handleUnauthorizedRequest(req, res);
  }
  next();
}

var router = express.Router();
router.get('/api/v1/user', checkAuthenticated, async (req, res) => {
  if(!req.user){
    res.status(401).json(unauthorizedResponse);
    return;
  }
  let tokenObj = req.user.access_token;
  let user = stringHelper.camelCaseKeys(req.user)
  if(tokenObj){
    user.accessToken = tokenObj.access_token;
    user.accessTokenExpiresAt = tokenObj.expires;
  }
  user.loginName = user.userLogin;
  user.id = authHelper.getIdFromUser(req.user);
  res.status(200).json(user)
})
// router.get('/api/v3/connectors/list', function(req, res) {
//   let opts = {
//     method: "GET",
//     rejectUnauthorized: process.env['PROXY_REJECT_UNAUTHORIZED'] || false,
//     headers: {},
//     //body: parameters && parameters.body
//   };
//   opts.headers['Accept'] = 'application/json';
//   return fetch(urlHelper.QM_API_ORIGIN + '/api/v3/connectors/list', opts)
// })

router.use('/api', proxy(urlHelper.QM_API_ORIGIN, {
  proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
    // you can update headers
    // proxyReqOpts.headers['X-Client-ID'] = process.env.QUANTIMODO_CLIENT_ID;
    // proxyReqOpts.headers['X-Client-Secret'] = process.env.QUANTIMODO_CLIENT_SECRET;
    const accessToken = authHelper.getAccessTokenFromRequest(srcReq);
    if(accessToken){
      console.info("Using access token from request: " + accessToken);
      proxyReqOpts.headers['authorization'] = `Bearer ${accessToken}`;
    }
    proxyReqOpts.rejectUnauthorized = process.env['PROXY_REJECT_UNAUTHORIZED'] || false
    proxyReqOpts.headers['X-Client-ID'] = qm.getClientId();
    proxyReqOpts.headers['Accept'] = 'application/json';
    return proxyReqOpts;
  },
  proxyReqPathResolver: function (req) {
    req.url = '/api' + req.url;
    qmLog.info('proxyReqPathResolver: '+ req.url)
    return req.url;
  },
  userResDecorator: function(proxyRes, proxyResData, userReq, userRes) {
    try {
      let str = proxyResData.toString();
      let data = JSON.parse(str);
      qmLog.debug('userResDecorator', {
        proxyRes: proxyRes,
        proxyResData: proxyResData,
        userReq: userReq,
        userRes: userRes,
      });
      return JSON.stringify(data);
    } catch (e) {
      qmLog.error(e.message, {
        e: e,
        proxyRes: proxyRes,
        proxyResData: proxyResData,
        userReq: userReq,
        userRes: userRes,
      });
      return proxyResData;
    }
  },
  proxyErrorHandler: function (err, res, next) {
    if(err && err.code){
      qmLog.error('proxyErrorHandler', {
        err: err,
        res: res
      });
    }
    switch (err && err.code) {
      //case 'ECONNRESET':    { return res.status(405).send('504 became 405'); }
      //case 'ECONNREFUSED':  { return res.status(200).send('gotcher back'); }
      default:              { next(err); }
    }
    next(err);
  }
}));

module.exports = router;
