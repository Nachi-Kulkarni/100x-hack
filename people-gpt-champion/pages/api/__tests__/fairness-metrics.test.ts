import { createMocks, RequestMethod } from 'node-mocks-http';
import fairnessMetricsHandler from '../fairness-metrics'; // Adjust path as necessary

describe('/api/fairness-metrics API Endpoint', () => {
  const makeRequest = (method: RequestMethod = 'GET') => {
    return createMocks({ method });
  };

  it('should return 200 OK for GET requests', async () => {
    const { req, res } = makeRequest('GET');
    await fairnessMetricsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it('should return the mock fairness data structure for GET requests', async () => {
    const { req, res } = makeRequest('GET');
    await fairnessMetricsHandler(req, res);
    const responseData = JSON.parse(res._getData());

    expect(responseData).toHaveProperty('demographicParity');
    expect(responseData).toHaveProperty('equalOpportunity');
    expect(responseData).toHaveProperty('timestamps');
    expect(responseData).toHaveProperty('alertThresholds');

    // Check some nested properties to ensure data looks as expected
    expect(responseData.timestamps.length).toBeGreaterThan(0);
    expect(Object.keys(responseData.demographicParity).length).toBeGreaterThan(0);

    const firstGroupKey = Object.keys(responseData.demographicParity)[0];
    expect(responseData.demographicParity[firstGroupKey]).toBeInstanceOf(Array);
    expect(responseData.demographicParity[firstGroupKey].length).toEqual(responseData.timestamps.length);

    expect(responseData.alertThresholds).toBeDefined();
    expect(responseData.alertThresholds.representation).toBeDefined();
    expect(responseData.alertThresholds.representation.metric).toEqual("selectionRate");
  });

  it('should return 405 Method Not Allowed for non-GET requests', async () => {
    const methods: RequestMethod[] = ['POST', 'PUT', 'DELETE', 'PATCH'];
    for (const method of methods) {
      const { req, res } = makeRequest(method);
      await fairnessMetricsHandler(req, res);
      expect(res._getStatusCode()).toBe(405);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe(`Method ${method} Not Allowed`);
    }
  });

  it('should set Allow header to GET for non-GET requests', async () => {
    const { req, res } = makeRequest('POST');
    await fairnessMetricsHandler(req, res);
    expect(res._getHeaders()).toHaveProperty('allow');
    expect(res._getHeaders().allow).toBe('GET');
  });
});
