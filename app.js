require('dotenv').config();
const path = require('path');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');

const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const scopes = 'write_themes';
const forwardingAddress = "https://theme-images-manager.herokuapp.com/";

const formidable = require('formidable');
const toBase64 = require('./utils/toBase64');

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/shopify', (req, res) => {
    const shop = req.query.shop;
    if (shop) {
        const state = nonce();
        const redirectUri = forwardingAddress + '/shopify/callback';
        const installUrl = 'https://' + shop +
            '/admin/oauth/authorize?client_id=' + apiKey +
            '&scope=' + scopes +
            '&state=' + state +
            '&redirect_uri=' + redirectUri;
    
        res.cookie('state', state);
        res.redirect(installUrl);
    } else {
      return res.status(400).send('Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request');
    }
});

app.get('/shopify/callback', (req, res) => {
    const { shop, hmac, code, state } = req.query;
    const stateCookie = cookie.parse(req.headers.cookie).state;

    if (state !== stateCookie) {
      return res.status(403).send('Request origin cannot be verified');
    }
  
    if (shop && hmac && code) {
          // DONE: Validate request is from Shopify
        const map = Object.assign({}, req.query);
        delete map['signature'];
        delete map['hmac'];
        const message = querystring.stringify(map);
        const providedHmac = Buffer.from(hmac, 'utf-8');
        const generatedHash = Buffer.from(
            crypto
            .createHmac('sha256', apiSecret)
            .update(message)
            .digest('hex'),
            'utf-8'
            );
        let hashEquals = false;

        try {
            hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac)
        } catch (e) {
            hashEquals = false;
        };

        if (!hashEquals) {
            return res.status(400).send('HMAC validation failed');
        }
        
            // DONE: Exchange temporary code for a permanent access token
        const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
        const accessTokenPayload = {
            client_id: apiKey,
            client_secret: apiSecret,
            code,
        };
        
        request.post(accessTokenRequestUrl, { json: accessTokenPayload })
        .then((accessTokenResponse) => {
            const accessToken = accessTokenResponse.access_token;
                // DONE: Use access token to make API call to 'themes' endpoint
            const shopRequestUrl = 'https://' + shop + '/admin/themes/46142128176/assets.json';
            const shopRequestHeaders = {
                'X-Shopify-Access-Token': accessToken,
            };

                console.log('TOKEN', accessToken);
                console.log(shopRequestUrl);

            request.get(shopRequestUrl, {headers: shopRequestHeaders})
            .then((shopRes) => {
                let shopObj = JSON.parse(shopRes)
                res.send(shopRes);
            })
            .catch((error) => {
                console.log(error.message)
            });
        })
        .catch((error) => {
            console.log(error.message)                
        });
        
    } else {
        res.status(400).send('Required parameters missing');
    }
});

app.get('/shopify/callback/images', (req, res) => {
    const shopRequestUrl = 'https://unique-test-store-131.myshopify.com/admin/themes/46142128176/assets.json';
    const shopRequestHeaders = {
        'X-Shopify-Access-Token': '1354658af88b9417d3c268dd3c22eae4',
    };

    request.get(shopRequestUrl, {headers: shopRequestHeaders})
    .then((shopRes) => {
        let shopObj = JSON.parse(shopRes)
        let images = shopObj.assets.filter(img => ['image/gif', 'image/jpeg', 'image/png'].includes(img.content_type));
        images.forEach(img => {
            img.name = img.key.slice(7, img.key.length);
            img.type = img.content_type;
        })
        res.send(images);
    })
    .catch((error) => {
        console.log(error.message)
    });
})

app.put('/shopify/callback/upload', (req, res) => {
    console.log('uploading...')
    let form = new formidable.IncomingForm();
    
    form.multiples = true;
    form.parse(req, (err, fields, files) => {
        if (!files.image[0]) {
            files.image = [files.image];
        }
        let fileInfo = toBase64(files.image);

        
        // PUT method to upload images to theme
        let data = [];
        for ( let i=0; i < fileInfo.length; i++ ) {
            let payload = {
                asset: {...fileInfo[i]}
            };
    
            const shopRequestHeaders = {
                'X-Shopify-Access-Token': '1354658af88b9417d3c268dd3c22eae4',
            };
            const shopRequestUrl = `https://unique-test-store-131.myshopify.com/admin/themes/46142128176/assets.json`;
            request.put({
                url: shopRequestUrl,
                body: payload,
                headers: shopRequestHeaders,
                json: true
            })
            .then((shopRes) => {
                data.push(shopRes);
                if (data.length === fileInfo.length) {
                    res.send(data)
                }
            })
            .catch((error) => {
                console.log(error.message);
            });
        }
    });
})

app.post('/shopify/callback/delete', (req, res) => {
    const shopRequestHeaders = {
        'X-Shopify-Access-Token': '1354658af88b9417d3c268dd3c22eae4',
    };

    for (let i=0; i < req.body.name.length; i++) {
        const shopRequestUrl = `https://unique-test-store-131.myshopify.com/admin/themes/46142128176/assets.json?asset[key]=assets/${req.body.name[i]}`;
        console.log(req.body.name)
        request.delete({
            url: shopRequestUrl,
            headers: shopRequestHeaders,
            json: true
        })
        .then((shopRes) => {
            res.send('Done removal!!!')
        })
        .catch((error) => {
            console.log(error.message);
        });
    }
})

app.listen(3030 || process.env.PORT, () => console.log('Listening to port 3030'))