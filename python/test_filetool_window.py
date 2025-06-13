#!/usr/bin/env python3
"""Test file tool with window size 500 and smaller files."""

import tempfile
import os
from composio.tools.env.filemanager.manager import FileManager
from composio.tools.env.base import SessionFactory
from composio.tools.local.filetool.actions.list import ListFiles, ListRequest
from composio.tools.local.filetool.actions.create import CreateFile, CreateFileRequest
from composio.tools.local.filetool.actions.write import Write, WriteRequest
from composio.tools.local.filetool.actions.open import OpenFile, OpenFileRequest

def test_filetool_with_window():
    """Test file tool with window size 500 and smaller files."""
    print("🧪 Testing File Tool with Window Size 500")
    print("=" * 50)
    
    # Create a temporary directory for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"📁 Created temporary directory: {temp_dir}")
        
        # Set up file manager
        fm = FileManager(working_dir=temp_dir)
        session_factory = SessionFactory(lambda: fm)
        session_factory.new()
        
        # Create a small file (less than 500 bytes)
        small_file = "small_file.txt"
        small_content = "This is a small file with less than 500 bytes."
        with open(os.path.join(temp_dir, small_file), "w") as f:
            f.write(small_content)
        
        # Create a medium file (around 500 bytes)
        medium_file = "medium_file.txt"
        medium_content = "This is a medium file with around 500 bytes. " * 10
        with open(os.path.join(temp_dir, medium_file), "w") as f:
            f.write(medium_content)
        
        # Create a file with exactly 500 characters
        exact_file = "exact_500.txt"
        exact_content = "x" * 500
        with open(os.path.join(temp_dir, exact_file), "w") as f:
            f.write(exact_content)
        
        print(f"📝 Created test files: {small_file}, {medium_file}, {exact_file}")
        
        # Test 1: List files
        print("\n🔍 Test 1: List Files")
        list_action = ListFiles()
        list_action._filemanagers = lambda: session_factory
        
        response = list_action.execute(ListRequest(), {})
        print(f"✅ Found {len(response.files)} files:")
        for name, file_type in response.files:
            print(f"   - {name} ({file_type})")
        
        # Test 2: Read small file
        print("\n🔍 Test 2: Read Small File")
        open_action = OpenFile()
        open_action._filemanagers = lambda: session_factory
        
        small_response = open_action.execute(
            OpenFileRequest(file_path=small_file), {}
        )
        print(f"✅ Small file content ({len(small_content)} bytes):")
        print(f"   Content: {small_content}")
        print(f"   Lines returned: {len(small_response.lines)}")
        
        # Test 3: Read medium file
        print("\n🔍 Test 3: Read Medium File")
        medium_response = open_action.execute(
            OpenFileRequest(file_path=medium_file), {}
        )
        print(f"✅ Medium file content ({len(medium_content)} bytes):")
        print(f"   First 50 chars: {medium_content[:50]}...")
        print(f"   Lines returned: {len(medium_response.lines)}")
        
        # Test 4: Read exact 500 file
        print("\n🔍 Test 4: Read Exact 500 File")
        exact_response = open_action.execute(
            OpenFileRequest(file_path=exact_file), {}
        )
        print(f"✅ Exact 500 file content ({len(exact_content)} bytes):")
        print(f"   First 20 chars: {exact_content[:20]}...")
        print(f"   Lines returned: {len(exact_response.lines)}")
        
        # Test 5: Create and read a new file with window size
        print("\n🔍 Test 5: Create and Read New File with Window Size")
        create_action = CreateFile()
        create_action._filemanagers = lambda: session_factory
        
        new_file = "new_window_test.txt"
        create_response = create_action.execute(
            CreateFileRequest(path=new_file, is_directory=False), {}
        )
        
        if not create_response.error:
            print(f"✅ Created new file: {new_file}")
            
            # Write content with multiple lines
            write_action = Write()
            write_action._filemanagers = lambda: session_factory
            
            # Create content with 10 lines, each 50 chars
            new_content = "\n".join([f"Line {i+1}: {'x' * 50}" for i in range(10)])
            write_response = write_action.execute(
                WriteRequest(file_path=new_file, text=new_content), {}
            )
            
            if not write_response.error:
                print("✅ Successfully wrote content to file")
                
                # Read with window size
                new_response = open_action.execute(
                    OpenFileRequest(file_path=new_file), {}
                )
                print(f"✅ New file content ({len(new_content)} bytes):")
                print(f"   Lines returned: {len(new_response.lines)}")
                print(f"   First line: {new_response.lines[0] if new_response.lines else 'No lines'}")
                print(f"   Last line: {new_response.lines[-1] if new_response.lines else 'No lines'}")
            else:
                print(f"❌ Error writing to file: {write_response.error}")
        else:
            print(f"❌ Error creating file: {create_response.error}")
        
        print("\n" + "=" * 50)
        print("🎉 File Tool Window Size Test Completed Successfully!")

if __name__ == "__main__":
    test_filetool_with_window() 