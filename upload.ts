import {
  GridFSBucket,
  MongoClient,
} from "https://deno.land/x/mongo@v0.29.3/mod.ts";

const client = new MongoClient();

await client.connect({
  db: "image",
  tls: true,
  servers: [
    {
      host: "cluster0-shard-00-00.s8vpt.mongodb.net",
      port: 27017,
    },
    {
      host: "cluster0-shard-00-01.s8vpt.mongodb.net",
      port: 27017,
    },
    {
      host: "cluster0-shard-00-02.s8vpt.mongodb.net",
      port: 27017,
    },
  ],
  credential: {
    username: "user",
    password: "qRUbZmd0CC4oxE9S",
    db: "image",
    mechanism: "SCRAM-SHA-1",
  },
});

const image_database = client.database("image");

const bucket = new GridFSBucket(image_database);

await bucket.delete(
  (await bucket.find({ filename: "current" }).toArray())[0]._id,
);

const upstream = await bucket.openUploadStream("current");
const writer = await upstream.getWriter();

writer.write(await Deno.readFile("original.png"));

await writer.close();
