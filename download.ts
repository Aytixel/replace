import { Image } from "https://deno.land/x/imagescript@v1.2.12/mod.ts";

const wait_worker = (worker: Worker) => {
  return new Promise((resolve) => {
    worker.onmessage = (e) => {
      if (e.data === "started") resolve(null);
    };
  });
};

const colors = [
  [109, 0, 26],
  [190, 0, 57],
  [255, 69, 0],
  [255, 168, 0],
  [255, 214, 53],
  [255, 248, 184],
  [0, 163, 104],
  [0, 204, 120],
  [126, 237, 86],
  [0, 117, 111],
  [0, 158, 170],
  [0, 204, 192],
  [36, 80, 164],
  [54, 144, 234],
  [81, 233, 244],
  [73, 58, 193],
  [106, 92, 255],
  [148, 179, 255],
  [129, 30, 159],
  [180, 74, 192],
  [228, 171, 255],
  [222, 16, 127],
  [255, 56, 129],
  [255, 153, 170],
  [109, 72, 47],
  [156, 105, 38],
  [255, 180, 112],
  [0, 0, 0],
  [81, 82, 82],
  [137, 141, 144],
  [212, 215, 217],
  [255, 255, 255],
];
const worker_count = 15;
const chunk_size = 10000;

const download = (): Promise<Image> => {
  return new Promise(async (resolve) => {
    const workers: Worker[] = [];
    const image = new Image(2000, 2000);
    let count = 0;
    let skip = 0;

    for (let i = 0; i < worker_count; i++) {
      const worker = new Worker(
        new URL("./download_worker.ts", import.meta.url).href,
        {
          type: "module",
          deno: {
            namespace: true,
            permissions: {
              net: true,
            },
          },
        } as any,
      );

      await wait_worker(worker);

      const request = () => {
        if (skip + chunk_size <= 4000000) {
          worker.postMessage({ skip, limit: chunk_size });

          skip += chunk_size;
        }
      };

      worker.onmessage = async (e) => {
        request();

        count += chunk_size;

        for (const image_data of e.data) {
          const id = image_data._id;
          const color = colors[image_data.color];

          image.bitmap[id * 4] = color[0];
          image.bitmap[id * 4 + 1] = color[1];
          image.bitmap[id * 4 + 2] = color[2];
          image.bitmap[id * 4 + 3] = 255;
        }

        console.log(`Worker ${i} : ${(count / 40000)}%`);

        if (count == 4000000) {
          for (let i = 0; i < worker_count; i++) workers[i].terminate();

          resolve(image);
        }
      };

      request();

      workers.push(worker);
    }
  });
};

export { colors, download };
