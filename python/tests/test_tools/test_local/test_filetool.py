# pylint: disable=protected-access,no-member,unsupported-membership-test,unspecified-encoding,not-an-iterable,unsubscriptable-object,unused-argument
import os
import tempfile

import pytest

from composio import Action
from composio.tools.env.base import SessionFactory
from composio.tools.env.factory import WorkspaceType
from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.chwdir import (
    ChangeWorkingDirectory,
    ChwdirRequest,
)
from composio.tools.local.filetool.actions.create import CreateFile, CreateFileRequest
from composio.tools.local.filetool.actions.edit import EditFile, EditFileRequest
from composio.tools.local.filetool.actions.find import FindFile, FindFileRequest
from composio.tools.local.filetool.actions.grep import SearchWord, SearchWordRequest
from composio.tools.local.filetool.actions.list import ListFiles, ListRequest
from composio.tools.local.filetool.actions.open import OpenFile, OpenFileRequest
from composio.tools.local.filetool.actions.write import Write, WriteRequest
from composio.tools.toolset import ComposioToolSet


@pytest.fixture(scope="module")
def temp_dir():
    with tempfile.TemporaryDirectory() as tmpdirname:
        yield tmpdirname


@pytest.fixture(scope="module")
def file_manager(temp_dir):
    fm = FileManager(working_dir=temp_dir)
    session_factory = SessionFactory(lambda: fm)
    session_factory.new()  # Create a default session
    return session_factory


@pytest.fixture(scope="module")
def mock_data(temp_dir):
    # Create directories
    os.makedirs(os.path.join(temp_dir, "dir1"))
    os.makedirs(os.path.join(temp_dir, "dir2"))

    # Create files with content
    with open(os.path.join(temp_dir, "file1.txt"), "w", encoding="utf-8") as f:
        f.write("This is file1 content\nWith multiple lines\n")
    with open(os.path.join(temp_dir, "file2.py"), "w", encoding="utf-8") as f:
        f.write("def test_function():\n    print('Hello, World!')\n")
    with open(os.path.join(temp_dir, "dir1", "file3.txt"), "w", encoding="utf-8") as f:
        f.write("This is file3 in dir1\n")


@pytest.mark.usefixtures("mock_data")
class TestFiletool:
    def test_list_files(self, file_manager):
        list_action = ListFiles()
        list_action._filemanagers = lambda: file_manager
        response = list_action.execute(ListRequest(), {})
        assert any(item == ("dir1", "dir") for item in response.files)
        assert any(item == ("dir2", "dir") for item in response.files)
        assert any(item == ("file1.txt", "file") for item in response.files)
        assert any(item == ("file2.py", "file") for item in response.files)

    def test_find_files(self, file_manager):
        find_action = FindFile()
        find_action._filemanagers = lambda: file_manager
        response = find_action.execute(FindFileRequest(pattern="*.txt"), {})
        assert "file1.txt" in response.results
        assert os.path.join("dir1", "file3.txt") in response.results

    def test_grep(self, file_manager):
        grep_action = SearchWord()
        grep_action._filemanagers = lambda: file_manager
        response = grep_action.execute(SearchWordRequest(word="content"), {})
        assert "file1.txt" in response.results
        assert response.results["file1.txt"][0][1] == "This is file1 content"

    def test_open_and_edit_file(self, file_manager):
        open_action = OpenFile()
        open_action._filemanagers = lambda: file_manager
        edit_action = EditFile()
        edit_action._filemanagers = lambda: file_manager

        # Open file
        open_response = open_action.execute(OpenFileRequest(file_path="file2.py"), {})
        assert "def test_function():" in open_response.lines[1]

        # Edit file
        edit_response = edit_action.execute(
            EditFileRequest(
                text="    print('Hello, Edited World!')", start_line=2, end_line=2
            ),
            {},
        )
        assert "Hello, Edited World!" in edit_response.updated_text

        # Verify changes
        open_response = open_action.execute(OpenFileRequest(file_path="file2.py"), {})
        assert "Hello, Edited World!" in open_response.lines[2]

    def test_create_and_write_file(self, file_manager, temp_dir):
        create_action = CreateFile()
        create_action._filemanagers = lambda: file_manager
        write_action = Write()
        write_action._filemanagers = lambda: file_manager

        response = create_action.execute(
            CreateFileRequest(path="new_file.txt", is_directory=False), {}
        )
        assert not response.error

        response = write_action.execute(
            WriteRequest(file_path="new_file.txt", text="This is a new file"), {}
        )
        assert not response.error

        # Verify file was created
        with open(os.path.join(temp_dir, "new_file.txt"), "r", encoding="utf-8") as f:
            content = f.read()
        assert content == "This is a new file"

    def test_change_working_directory(self, file_manager):
        chdir_action = ChangeWorkingDirectory()
        chdir_action._filemanagers = lambda: file_manager
        list_action = ListFiles()
        list_action._filemanagers = lambda: file_manager

        # Change to dir1
        chdir_response = chdir_action.execute(ChwdirRequest(path="dir1"), {})
        assert not chdir_response.error

        # List files in dir1
        list_response = list_action.execute(ListRequest(), {})
        assert ("file3.txt", "file") in list_response.files

        # Change back to parent directory
        chdir_response = chdir_action.execute(ChwdirRequest(path=".."), {})
        assert not chdir_response.error

        # Verify we're back in the root temp directory
        list_response = list_action.execute(ListRequest(), {})
        assert ("dir1", "dir") in list_response.files
        assert ("dir2", "dir") in list_response.files

    def test_complex_workflow(self, file_manager):
        # This test combines multiple actions to test a more complex workflow
        find_action = FindFile()
        find_action._filemanagers = lambda: file_manager
        grep_action = SearchWord()
        grep_action._filemanagers = lambda: file_manager
        edit_action = EditFile()
        edit_action._filemanagers = lambda: file_manager
        open_action = OpenFile()
        open_action._filemanagers = lambda: file_manager

        # Find all .txt files
        find_response = find_action.execute(FindFileRequest(pattern="*.txt"), {})
        assert len(find_response.results) >= 2

        # Search for 'content' in all files
        grep_response = grep_action.execute(SearchWordRequest(word="content"), {})
        assert "file1.txt" in grep_response.results

        # Edit file1.txt
        edit_response = edit_action.execute(
            EditFileRequest(
                file_path="file1.txt", text="New content line", start_line=1, end_line=1
            ),
            {},
        )
        assert "New content line" in edit_response.updated_text

        # Verify changes
        open_response = open_action.execute(OpenFileRequest(file_path="file1.txt"), {})
        assert "New content line" in open_response.lines[1]

        # Search again, should find the new content
        grep_response = grep_action.execute(SearchWordRequest(word="New content"), {})
        assert "file1.txt" in grep_response.results

    def test_case_sensitive_search(self, file_manager):
        grep_action = SearchWord()
        grep_action._filemanagers = lambda: file_manager

        # Case-insensitive search (default)
        response = grep_action.execute(SearchWordRequest(word="CONTENT"), {})
        assert "file1.txt" in response.results

        # Case-sensitive search
        response = grep_action.execute(
            SearchWordRequest(word="CONTENT", case_insensitive=False), {}
        )
        assert "file1.txt" not in response.results

    def test_recursive_search(self, file_manager):
        grep_action = SearchWord()
        grep_action._filemanagers = lambda: file_manager

        # Recursive search (default)
        response = grep_action.execute(SearchWordRequest(word="file3"), {})
        assert os.path.join("dir1", "file3.txt") in response.results

        # Non-recursive search
        response = grep_action.execute(
            SearchWordRequest(word="file3", recursive=False), {}
        )
        assert os.path.join("dir1", "file3.txt") not in response.results

    def test_find_with_depth(self, file_manager):
        find_action = FindFile()
        find_action._filemanagers = lambda: file_manager

        # Find with depth 0 (only current directory)
        response = find_action.execute(FindFileRequest(pattern="*.txt", depth=0), {})
        assert "file1.txt" in response.results
        assert os.path.join("dir1", "file3.txt") not in response.results

        # Find with depth 1 (current directory and immediate subdirectories)
        response = find_action.execute(FindFileRequest(pattern="*.txt", depth=1), {})
        assert "file1.txt" in response.results
        assert os.path.join("dir1", "file3.txt") in response.results

    def test_error_handling(self, file_manager):
        open_action = OpenFile()
        open_action._filemanagers = lambda: file_manager
        write_action = Write()
        write_action._filemanagers = lambda: file_manager

        # Try to open a non-existent file
        response = open_action.execute(
            OpenFileRequest(file_path="non_existent.txt"), {}
        )
        assert response.error is not None

        # Try to write to a directory
        response = write_action.execute(
            WriteRequest(file_path="dir1", text="This should fail"), {}
        )
        assert (
            "Is a directory" in response.error or "Permission denied" in response.error
        )

    def test_create_file(self, file_manager, temp_dir):
        create_action = CreateFile()
        create_action._filemanagers = lambda: file_manager

        # Test creating a new file
        response = create_action.execute(
            CreateFileRequest(path="new_file.txt", is_directory=False), {}
        )
        assert not response.error
        assert response.path.endswith("new_file.txt")
        assert os.path.isfile(os.path.join(temp_dir, "new_file.txt"))

        # Test creating a new directory
        response = create_action.execute(
            CreateFileRequest(path="new_dir", is_directory=True), {}
        )
        assert not response.error
        assert response.path.endswith("new_dir")
        assert os.path.isdir(os.path.join(temp_dir, "new_dir"))

        # Test creating a file in a non-existent directory
        with pytest.raises(FileNotFoundError) as excinfo:
            create_action.execute(
                CreateFileRequest(path="non_existent_dir/file.txt", is_directory=False),
                {},
            )
        assert "No such file or directory" in str(excinfo.value)

        # Test creating a file with an invalid name
        with pytest.raises(ValueError) as excinfo:
            create_action.execute(CreateFileRequest(path="", is_directory=False), {})
        assert "Path cannot be empty" in str(excinfo.value)

    def test_filetool_with_toolset(self, file_manager, temp_dir):
        toolset = ComposioToolSet(workspace_config=WorkspaceType.Host())

        chdir_response = toolset.execute_action(
            Action.FILETOOL_CHANGE_WORKING_DIRECTORY, {"path": temp_dir}
        )
        assert not chdir_response.get("error")

        # List files
        list_response = toolset.execute_action(Action.FILETOOL_LIST_FILES, {})
        assert ("file1.txt", "file") in list_response["files"]
        assert ("dir1", "dir") in list_response["files"]

        # Find .txt files
        find_response = toolset.execute_action(
            Action.FILETOOL_FIND_FILE, {"pattern": "*.txt"}
        )
        assert "file1.txt" in find_response["results"]
        assert os.path.join("dir1", "file3.txt") in find_response["results"]

        # Search for content
        grep_response = toolset.execute_action(
            Action.FILETOOL_SEARCH_WORD, {"word": "content"}
        )
        assert "file1.txt" in grep_response["results"]

        # Edit file
        edit_response = toolset.execute_action(
            Action.FILETOOL_EDIT_FILE,
            {
                "file_path": "file1.txt",
                "text": "New content line",
                "start_line": 1,
                "end_line": 1,
            },
        )
        assert "New content line" in edit_response["updated_text"]

        # Verify changes
        open_response = toolset.execute_action(
            Action.FILETOOL_OPEN_FILE, {"file_path": "file1.txt"}
        )
        assert "New content line" in open_response["lines"][1]

        # Change directory
        chdir_response = toolset.execute_action(
            Action.FILETOOL_CHANGE_WORKING_DIRECTORY, {"path": "dir1"}
        )
        assert not chdir_response.get("error")

        # List files in new directory
        list_response = toolset.execute_action(Action.FILETOOL_LIST_FILES, {})
        assert ("file3.txt", "file") in list_response["files"]

        # Change back to parent directory
        toolset.execute_action(Action.FILETOOL_CHANGE_WORKING_DIRECTORY, {"path": ".."})

        # Create and write to a new file
        toolset.execute_action(
            Action.FILETOOL_CREATE_FILE,
            {"path": "new_file.txt", "is_directory": False},
        )
        write_response = toolset.execute_action(
            Action.FILETOOL_WRITE,
            {"file_path": "new_file.txt", "text": "This is a new file"},
        )
        assert not write_response.get("error")

        # Verify new file content
        open_response = toolset.execute_action(
            Action.FILETOOL_OPEN_FILE, {"file_path": "new_file.txt"}
        )
        assert "This is a new file" in open_response["lines"][1]
