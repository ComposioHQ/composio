
import argparse
from .actions import read_pdf, extract_text

def main():
    parser = argparse.ArgumentParser(description='PDF Reader/Parser Tool')
    subparsers = parser.add_subparsers(dest='command')

    # Subparser for read_pdf
    read_parser = subparsers.add_parser('read_pdf', help='Read PDF file metadata')
    read_parser.add_argument('file_path', type=str, help='Path to the PDF file')

    # Subparser for extract_text
    extract_parser = subparsers.add_parser('extract_text', help='Extract text from a PDF file')
    extract_parser.add_argument('file_path', type=str, help='Path to the PDF file')
    extract_parser.add_argument('page_number', type=int, help='Page number to extract text from')

    args = parser.parse_args()

    if args.command == 'read_pdf':
        result = read_pdf(args.file_path)
        print(f"Number of Pages: {result['num_pages']}")
        print("Metadata:")
        for key, value in result['metadata'].items():
            print(f"  {key}: {value}")

    elif args.command == 'extract_text':
        text = extract_text(args.file_path, args.page_number)
        print("Extracted Text:")
        print(text)

if __name__ == '__main__':
    main()
