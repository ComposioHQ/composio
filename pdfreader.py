from composio import action

@action(toolname="pdfreader", requires=["PyPDF2"])
def pdfreader(pdf_location: str) -> str:
    """
    PDF reader that parses and summarizes the first 1000 words of the given PDF.

    :param pdf_location: Local or URL path to the PDF file.
    :return text: text of the pdf.
    """
    import PyPDF2
    try:
        # Open the PDF file
        with open(pdf_location, "rb") as file:
            reader = PyPDF2.PdfReader(file)
            text = ""

            # Extract text from each page
            for page in reader.pages:
                text += page.extract_text()

            # Split text into words and summarize the first 1000 words
            words = text.split()
            summary = " ".join(words)

            return summary

    except Exception as e:
        return f"An error occurred while reading the PDF: {e}"
