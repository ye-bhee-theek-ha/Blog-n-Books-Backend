
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
    res.send("API is running..")
})

app.use("/api", Routes)


app.use(NotFound);
app.use(errHandler);


module.exports = app;


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});