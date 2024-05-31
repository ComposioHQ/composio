from datasets import load_dataset

'''
huggingface dataset download :
Its a swe-bench lite dataset, description can be found here
- dataset link: https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite
'''


def filter_short_problem_statements(instance):
    return len(instance["problem_statement"].split()) > 40


def main():
    # Load the SWE-bench dataset
    dev_dataset = load_dataset("princeton-nlp/SWE-bench", split="dev")
    test_dataset = load_dataset("princeton-nlp/SWE-bench", split="test")

    # Display the first few entries
    print(test_dataset[:5])


if __name__ == "__main__":
    main()
