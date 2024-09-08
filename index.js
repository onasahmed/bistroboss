const express = require('express')
const app = express()

app.use(express.json())
const port = 3000
const cors = require('cors')
app.use(cors())
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET);

app.use(express.static("public"));
app.use(express.json());
const jwt = require('jsonwebtoken');
const JWTverify = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).send('Unauthorized Access');
    }

    jwt.verify(token, process.env.JWT_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(401).send('Access Denied')
        }
        req.decoded = decoded;
        next();
    });




};


app.get('/', (req, res) => {
    res.send('Hello World!')
})
const dbName = process.env.DB_NAME
const password = process.env.DB_PASSWORD
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${dbName}:${password}@cluster0.j55wfnv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    const database = client.db("bistroboss").collection('carts')
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const Admin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const admin = await client.db("bistroboss").collection('users').findOne(query);
            if (admin?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'Unauthorized Access' })
            }
            next()

        }
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.JWT_TOKEN, { expiresIn: '24h' });
            res.send({ token })

        })

        app.get('/menu', async (req, res) => {
            const menu = await client.db("bistroboss").collection('menu').find().toArray();
            res.send(menu)

        })
        app.get('/users', JWTverify, Admin, async (req, res) => {
            const users = await client.db("bistroboss").collection('users').find().toArray();
            res.send(users)
        })
        app.post('/users', async (req, res) => {
            const data = req.body
            const email = data.email
            const query = { email: email };
            const existingUser = await client.db("bistroboss").collection('users').findOne(query);

            if (existingUser) {
                return res.send({ message: "User Already Exist" })
            }
            const result = await client.db("bistroboss").collection('users').insertOne(data);
            res.send(result)

        })

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await client.db("bistroboss").collection('users').updateOne(filter, updateDoc);
            res.send(result)
        })
        app.get('/users/admin/:email', JWTverify, async (req, res) => {

            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ error: true, message: "Forbidden Access" })
            }
            const query = { email: email };
            const user = await client.db("bistroboss").collection('users').findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        });
        app.get('/carts', JWTverify, async (req, res) => {

            const email = req.query.email;

            if (!email) {
                return res.send([]);
            }
            const decodedEmail = req.decoded.email


            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'Forbidden Access' })

            }

            const query = { email: email };
            const user = await client.db("bistroboss").collection('carts').find(query).toArray();
            res.send(user);
        });

        app.post('/carts', async (req, res) => {
            const data = req.body
            const result = await client.db("bistroboss").collection('carts').insertOne(data);
            res.send(result)

        })
        app.delete('/cartdelete/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await database.deleteOne(query);
            if (result.deletedCount > 0) {
                res.send(result);
            } else {
                console.log("No documents matched the query. Deletion unsuccessful.");
                return res.status(404).send({ message: "Item not found" });
            }

            console.log(result);

        });
        app.post('/items', JWTverify, Admin, async (req, res) => {

            const data = req.body
            console.log(data);
            const menu = await client.db("bistroboss").collection('menu').insertOne(data);
            res.send(menu)
        })
        app.delete('/itemdelete/:id', JWTverify, Admin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await client.db("bistroboss").collection('menu').deleteOne(query);
            if (result.deletedCount > 0) {
                res.send(result);
            } else {
                console.log("No documents matched the query. Deletion unsuccessful.");
                return res.status(404).send({ message: "Item not found" });
            }

            console.log(result);

        });
        //Stripe Intent
        app.post("/create-payment-intent", JWTverify, async (req, res) => {
            const { price } = req.body;


            const paymentIntent = await stripe.paymentIntents.create({
                amount: price * 100,
                currency: "usd",
                "payment_method_types": [
                    "card",

                ],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,

            });
        });
        // payment history
        app.post("/payment", async (req, res) => {
            const { payment } = req.body;
            console.log(payment);
            const result = await client.db("bistroboss").collection('payment').insertOne(payment);
            const query = {
                _id: { $in: payment.itemsId.map(id => new ObjectId(id)) }
            }
            const deleteCart = await client.db("bistroboss").collection('carts').deleteMany(query);
            res.send({ result, deleteCart })
        });
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})