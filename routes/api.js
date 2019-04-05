/*
*
*
*       Complete the API routing below
*
*
*/

'use strict';

let expect = require('chai').expect;
let MongoClient = require('mongodb');
let request = require('request');
let rp = require('request-promise');
// let Promise = require('./promise');

const CONNECTION_STRING = process.env.DB;
//MongoClient.connect(CONNECTION_STRING, function(err, db) {});

module.exports = function (app) {

  app.route('/api/stock-prices')
    .get(function (req, res){
      const stock = req.query.stock;
      const like  = (req.query.like == 'true')? 1:0;
      const ip    = req.ip;
      // console.log(stock,like,ip)
      if (typeof stock == 'string') {
      MongoClient.connect(CONNECTION_STRING, function(err, db) {

        // console.log('Connected')
        const stockData = {stock:stock,price:0,likes:0}
        const url = 'https://api.iextrading.com/1.0/stock/'+stock+'/price'

        new Promise((resolve,reject) => {
          db.collection('stocks').find({stock:stock}).toArray((err,result)=>{
            if (result.length > 0 ) {
              stockData["likes"] = result[0]["likes"]
              resolve({modify: result[0]['like_ips'].includes(ip) == false & like===1})
            } else {
              resolve({modify: like===1})
            }
          })
        })
        .then((result)=>{
          // console.log(result)
          if (result.modify){
            console.log('Modify')
            db.collection('stocks').findAndModify(
                      {stock: stock},
                      {},
                      { $push: {like_ips: ip},
                        $inc: {likes: like} },
                      {new:true, upsert: true},
                      (err,result)=>{
                        if (err) throw err
                        stockData["likes"] = result.value["likes"]
                        // console.log(stockData)
              })
          }
        }).then((result)=>{
          rp(url).then(price => {
            stockData["price"] = price
            console.log(stockData)
            res.json({stockData})
          });
        })
        .catch((err) => { console.log(err) })
      });
    } else {
      MongoClient.connect(CONNECTION_STRING, function(err, db) {
        // console.log('Connected')
        const stockData = [{stock:0,price:0,rel_likes:0},
          {stock:0,price:0,rel_likes:0}]
        const likes = [0,0]

        let promisesApi = stock.map((s,i)=> {
          const url = 'https://api.iextrading.com/1.0/stock/'+s+'/price'
          stockData[i]['stock'] = s
          return rp(url).then(price => {
            stockData[i]["price"] = price
          });
        })

        let promisesDb = stock.map((s,i)=>{
          let promise = new Promise((resolve,reject) => {
            db.collection('stocks').find({stock:s}).toArray((err,result)=>{
              if (result.length > 0 ) {
                likes[i] = result[0]["likes"]
                resolve({modify: result[0]['like_ips'].includes(ip) == false & like===1})
              } else {
                resolve({modify: like===1})
              }
            })
          })
          .then((result)=>{
            if (result.modify) {
              console.log('Modify')
              db.collection('stocks').findAndModify(
                        {stock: s},
                        {},
                        { $push: {like_ips: ip},
                          $inc: {likes: like} },
                        {new:true, upsert: true},
                        (err,result)=>{
                          if (err) throw err
                          likes[i] = result.value["likes"]
                })
            }
          })
          .catch((err) => { console.log(err) })
          return promise
        });

        let promises = promisesApi.concat(promisesDb)

        Promise.all(promises).then((values)=>{
          // console.log('Resolved',stockData)
          // console.log('likes',likes)
          let rel_likes = likes[0]-likes[1]
          console.log('rel_likes',rel_likes)
          stockData[0].rel_likes = rel_likes
          stockData[1].rel_likes = rel_likes > 0? -1*rel_likes: 0;
          console.log('stockData',stockData)
          res.json({stockData})
        });
      });
    }
  });
}
