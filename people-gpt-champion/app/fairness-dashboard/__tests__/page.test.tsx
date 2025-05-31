import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FairnessDashboardPage from '../page'; // Adjust path as necessary

// Mock Recharts components to prevent rendering errors in Jest environment
// Recharts relies on browser APIs not available in JSDOM.
// This simple mock will prevent errors but not test chart rendering.
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
    BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
    Line: () => <div data-testid="line" />,
    Bar: () => <div data-testid="bar" />,
    XAxis: () => <div data-testid="x-axis" />,
    YAxis: () => <div data-testid="y-axis" />,
    CartesianGrid: () => <div data-testid="cartesian-grid" />,
    Tooltip: () => <div data-testid="tooltip" />,
    Legend: () => <div data-testid="legend" />,
  };
});


describe('FairnessDashboardPage', () => {
  it('renders the main title', async () => {
    render(<FairnessDashboardPage />);
    // Wait for state updates if any (though mock data is synchronous now)
    await waitFor(() => {
      expect(screen.getByText('Fairness Monitoring Dashboard')).toBeInTheDocument();
    });
  });

  it('renders the introductory placeholder text about mock data', async () => {
    render(<FairnessDashboardPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/This dashboard provides a conceptual overview of fairness metrics\. Currently, it displays mock data\./i)
      ).toBeInTheDocument();
    });
  });

  it('renders sections for Demographic Parity and Equal Opportunity', async () => {
    render(<FairnessDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Demographic Parity (Selection Rates)')).toBeInTheDocument();
      expect(screen.getByText('Equal Opportunity (True Positive Rates)')).toBeInTheDocument();
    });
  });

  it('displays chart containers (mocked Recharts components)', async () => {
    render(<FairnessDashboardPage />);
    await waitFor(() => {
      // Check that our mocked chart components are present
      expect(screen.getAllByTestId('responsive-container').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByTestId('line-chart').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId('bar-chart').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays a conceptual alert message if mock data meets alert conditions', async () => {
    // The mock data is designed to trigger the conceptual alert.
    // If mockApiData in page.tsx changes, this test might need adjustment.
    render(<FairnessDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Fairness Alert')).toBeInTheDocument();
      expect(screen.getByText(/A demographic group's representation .* is below the .* threshold/i)).toBeInTheDocument();
    });
  });

  it('renders the footer note on alerting', async () => {
    render(<FairnessDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Note on Alerting/i)).toBeInTheDocument();
    });
  });
});
