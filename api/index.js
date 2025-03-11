
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const connectDB = require("./config/db");

const Routes = require("./Routes/Routes");

const { NotFound, errHandler } = require("./middlewares/errorMiddleware");

const bodyParser = require('body-parser');

const app = express();

var cors = require('cors')
const corsOptions ={
    credentials:true,
    optionSuccessStatus:200
}
app.use(cors(corsOptions));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

connectDB();
app.use(express.json());


app.get("/", (req, res) => {
    res.send("API is running on vercel...")
})

// app.use("/api", Routes)


app.use(NotFound);
app.use(errHandler);

const PORT = process.env.PORT || 4000;
console.log(PORT)
app.listen(PORT, '0.0.0.0', console.log(`server started on port ${PORT}`))


module.exports = app;