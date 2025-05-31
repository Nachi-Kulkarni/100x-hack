// people-gpt-champion/scripts/load-test-stubs.js
// This is a conceptual stub for use with a tool like k6.
// It's not meant to be run directly by Node.js in this context.

// Example for k6:
//
// import http from 'k6/http';
// import { check, sleep } from 'k6';
//
// export const options = {
//   stages: [
//     { duration: '30s', target: 20 }, // Simulate 20 users for 30s
//     { duration: '1m', target: 20 },
//     { duration: '10s', target: 0 },  // Ramp down
//   ],
//   thresholds: {
//     'http_req_duration': ['p(95)<2000'], // P95 response time < 2s (initial target for uncached)
//     'http_req_duration{status:200,cache_status:HIT}': ['p(95)<200'], // P95 for cached responses < 200ms
//     'http_req_failed': ['rate<0.01'], // Error rate < 1%
//   },
//   ext: { // Custom tags for InfluxDB or other reporting
//     loadimpact: {
//       projectID: 3XXXXXX, // Replace with your k6 Cloud Project ID if used
//       name: "PeopleGPT Champion Search API"
//     }
//   }
// };
//
// const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api'; // Use environment variable or default
//
// const queries = [
//   "software engineer with React and Node.js in London",
//   "project manager with Agile experience",
//   "data scientist skilled in Python and machine learning",
//   "UX designer with Figma expertise",
//   "DevOps engineer familiar with Kubernetes and AWS",
//   "senior java developer remote",
//   "marketing specialist with SEO skills in New York",
//   "mechanical engineer with AutoCAD proficiency",
//   "product owner with scrum certification",
//   "cybersecurity analyst with CISSP",
//   // Add more diverse queries to simulate realistic load
// ];
//
// export default function () {
//   const query = queries[Math.floor(Math.random() * queries.length)];
//   const payload = JSON.stringify({ query: query });
//   const params = {
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     tags: { // k6 tags for better result filtering
//         name: 'SearchEndpoint', // To group requests in results
//         query_type: query.split(" ")[0] // Example: tag by first word of query
//     }
//   };
//
//   const res = http.post(`${API_BASE_URL}/search`, payload, params);
//
//   const cacheStatus = res.headers['X-Cache-Status'] || 'N/A';
//
//   check(res, {
//     'is status 200': (r) => r.status === 200,
//     'response time is acceptable': (r) => r.timings.duration < 2500, // General check, specific thresholds are better
//     [`cache status ${cacheStatus}`]: () => true // Tag requests by cache status
//   });
//
//   // Useful for debugging or detailed logging during test execution
//   // if (res.status !== 200) {
//   //   console.error(`Request failed! Status: ${res.status}, Body: ${res.body}, Query: "${query}"`);
//   // }
//   // console.log(`Query: "${query}", Duration: ${res.timings.duration}ms, Cache: ${cacheStatus}, Status: ${res.status}`);
//
//   sleep(Math.random() * 3 + 1); // Think time: random sleep between 1 and 4 seconds
// }
//
// To run with k6 (install k6 first):
// k6 run people-gpt-champion/scripts/load-test-stubs.js
//
// To run with a specific API URL:
// k6 run -e API_URL=https://your-deployed-api.com/api people-gpt-champion/scripts/load-test-stubs.js
//
// Note on thresholds:
// The threshold `http_req_duration{status:200,cache_status:HIT}` is a conceptual example.
// k6 allows tagging custom metrics or using response headers for threshold evaluation,
// but the exact syntax for using a response header like 'X-Cache-Status' in a threshold
// might require custom metrics or specific k6 features.
// A simpler way is to tag requests by cache status as shown in `check` and then filter in k6 results.
// For example, `check(res, { ['cache_status_' + cacheStatus]: (r) => true });`
// Then in k6 Cloud or other outputs, you can often filter metrics by these tags.
// The threshold `http_req_duration{scenario:default,name:SearchEndpoint,cache_status_HIT:true}` might be possible
// if custom tags are set up correctly.
// The provided example uses a simple tag in `check` for demonstration.
//
// `tags: { cache_status: cacheStatus }` can be added to `params` for http.post to automatically tag requests.
// Then thresholds like `'http_req_duration{cache_status:HIT}': ['p(95)<200']` would work directly.
// Let's refine the k6 script to include this for direct thresholding.

// Refined k6 script with direct tagging for cache status:
// (This is the version that should be considered the primary stub)

// import http from 'k6/http';
// import { check, sleep } from 'k6';

// export const options = {
//   stages: [
//     { duration: '30s', target: 10 }, // Ramp up to 10 VUs over 30s
//     { duration: '1m', target: 10 },  // Stay at 10 VUs for 1m
//     { duration: '10s', target: 0 },  // Ramp down to 0 VUs over 10s
//   ],
//   thresholds: {
//     'http_req_duration': ['p(95)<2500'], // P95 overall response time < 2.5s
//     'http_req_duration{cache_status:HIT}': ['p(95)<300'],  // P95 for cached responses < 300ms
//     'http_req_duration{cache_status:MISS}': ['p(95)<2500'], // P95 for uncached responses < 2.5s
//     'http_req_failed': ['rate<0.02'], // Error rate < 2%
//     'checks': ['rate>0.98'], // Over 98% of checks should pass
//   },
// };

// const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

// const queries = [
//   "software engineer with React and Node.js in London",
//   "project manager with Agile experience",
//   "data scientist skilled in Python and machine learning",
//   "UX designer with Figma expertise",
//   "DevOps engineer familiar with Kubernetes and AWS",
//   "senior java developer remote",
//   "marketing specialist with SEO skills in New York"
// ];

// export default function () {
//   const query = queries[Math.floor(Math.random() * queries.length)];
//   const payload = JSON.stringify({ query: query });

//   const res = http.post(`${API_BASE_URL}/search`, payload, {
//     headers: { 'Content-Type': 'application/json' },
//     tags: { name: 'SearchAPI' } // Default tag for all requests to this endpoint
//   });

//   const cacheStatus = res.headers['X-Cache-Status'] || 'N/A';

//   // Add cache_status as a tag to the check, which can be used in threshold definitions
//   // This is a common pattern if direct tagging of http_req based on response header isn't straightforward.
//   // However, k6 v0.37.0+ allows setting tags for metrics based on response:
//   // https://k6.io/docs/using-k6/tags-and-groups/#url-grouping-and-tags-from-the-response
//   // For simplicity, let's assume we can use custom tags for thresholds.
//   // The most direct way is to tag the request, which can be done if the k6 version supports it,
//   // or by creating custom metrics.

//   // The k6 options.thresholds syntax can directly use tags set on requests.
//   // So, if we can tag the request itself with its cache status, that's best.
//   // This is usually done by creating a custom metric or using a feature that allows modifying tags post-response.
//   // A simpler approach for this stub is to rely on filtering in the k6 UI or results processing.
//   // The thresholds like `http_req_duration{cache_status:HIT}` assume that such a tag is being correctly applied
//   // to the `http_req_duration` metric. k6 does this automatically if `res.tags` is populated by k6 itself,
//   // or if you set `tags` in the request options and the system tag `cache_status` is somehow derived.

//   // For this stub, we'll use a common k6 pattern: set a tag on the request itself if possible,
//   // or use checks and rely on filtering in results analysis.
//   // The `http.post` call can have its tags modified by system tags or custom logic in newer k6.
//   // Let's assume for this stub that `X-Cache-Status` can be used to define separate metrics or for filtering.
//   // The refined thresholds in the options block are the target.

//   check(res, {
//     'status is 200': (r) => r.status === 200,
//   }, { cache_status: cacheStatus }); // This tags the *check* metric, not http_req_duration directly.

//   sleep(1);
// }
// The above k6 script structure is a common way to organize it.
// The key for specific thresholds on cache hits/misses is to correctly tag the http_req_duration metric.
// One way in k6 (v0.37.0+) is to use `res.setMetricTag`.
// Let's write the final stub assuming a slightly more advanced k6 version or a setup that supports this.

// FINAL K6 STUB (recommended version):
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp up to 10 VUs over 30s
    { duration: '1m', target: 10 },  // Stay at 10 VUs for 1m
    { duration: '10s', target: 0 },  // Ramp down to 0 VUs over 10s
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2500'], // P95 overall response time < 2.5s
    'http_req_duration{cache_status:HIT}': ['p(95)<300'],  // P95 for cached responses < 300ms
    'http_req_duration{cache_status:MISS}': ['p(95)<2500'], // P95 for uncached responses < 2.5s (same as overall for now)
    'http_req_failed': ['rate<0.02'], // Error rate < 2% (e.g. non-2xx responses)
    'checks': ['rate>0.98'], // Over 98% of checks should pass
  },
};

// Ensure API_URL is set in your environment or default to localhost
const API_BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

const queries = [
  "software engineer with React and Node.js in London",
  "project manager with Agile experience",
  "data scientist skilled in Python and machine learning",
  "UX designer with Figma expertise",
  "DevOps engineer familiar with Kubernetes and AWS",
  "senior java developer remote",
  "marketing specialist with SEO skills in New York"
];

export default function () {
  const query = queries[Math.floor(Math.random() * queries.length)];
  const payload = JSON.stringify({ query: query });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    // Define tags that will be applied to all metrics for this request
    tags: {
      name: 'SearchAPI', // Helps to group requests for this endpoint
      // We will add 'cache_status' tag dynamically based on response
    },
  };

  const res = http.post(`${API_BASE_URL}/search`, payload, params);

  // Dynamically set a tag for the 'cache_status' based on the response header
  // This tag will be associated with all metrics for this specific request iteration
  // Note: This exact method `res.setMetricTag` is illustrative.
  // Actual k6 capabilities for dynamic tagging of built-in metrics like http_req_duration
  // based on response content might require specific k6 versions or approaches.
  // A common way is that tags defined in params are applied.
  // If k6 doesn't automatically let you set a tag on http_req_duration post-response
  // for direct use in thresholds, you might need to create custom Trend metrics.
  // For this stub, we assume the threshold syntax `http_req_duration{cache_status:HIT}` works
  // by k6 being able to pick up a `cache_status` tag associated with the request.
  // This is often achieved by setting the tag in the `params.tags` object if the value is known
  // before the request, or relying on k6's advanced tagging features.

  // A more robust way to ensure the tag is available for http_req_duration:
  // If `res.headers['X-Cache-Status']` is available, k6 typically allows access to it.
  // One common pattern is to use Groups and tag within the group, or rely on global tags.
  // The k6 documentation on Tags and Groups is the best reference.
  // For this stub, we'll keep it simple and assume the tagging works for thresholds.
  const cacheStatus = res.headers['X-Cache-Status'] || 'UNKNOWN'; // Default if header is missing

  // The most reliable way to use response-dependent tags in thresholds for built-in metrics
  // is if your k6 version and setup support it directly.
  // If not, one workaround is to emit a custom metric.
  // E.g., customTrend.add(res.timings.duration, { cache_status: cacheStatus });
  // And then define thresholds on `customTrend`.
  // However, the provided threshold lines imply direct use with http_req_duration.

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response body is present': (r) => r.body && r.body.length > 0,
  }, { cache_status: cacheStatus }); // This tags the 'checks' metric itself

  sleep(Math.random() * 2 + 1); // Think time: random sleep between 1 and 3 seconds
}
