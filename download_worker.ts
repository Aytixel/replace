import { MongoClient } from "https://deno.land/x/mongo@v0.29.3/mod.ts";

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
const pixel_collection = image_database.collection("pixel");

(self as unknown as Worker).onmessage = async (e) => {
  const cursor = pixel_collection.find({});

  cursor.skip(e.data.skip).limit(e.data.limit);

  (self as unknown as Worker).postMessage(await cursor.toArray());
};

(self as unknown as Worker).postMessage("started");
