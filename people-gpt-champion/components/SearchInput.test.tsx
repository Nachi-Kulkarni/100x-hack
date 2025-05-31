import { render, screen, fireEvent } from '@testing-library/react';
import SearchInput from './SearchInput'; // Adjusted path

describe('SearchInput', () => {
  it('renders correctly', () => {
    render(<SearchInput onSearch={() => {}} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('calls onSearch with the input value when form is submitted', () => {
    const mockOnSearch = jest.fn();
    render(<SearchInput onSearch={mockOnSearch} />);
    const input = screen.getByPlaceholderText('Search...');
    const searchButton = screen.getByRole('button', { name: /Search/i });

    fireEvent.change(input, { target: { value: 'test query' } });
    fireEvent.click(searchButton);

    expect(mockOnSearch).toHaveBeenCalledWith('test query');
  });
});
