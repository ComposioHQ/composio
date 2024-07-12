# This file is based on code from
# https://github.com/paul-gauthier/aider/blob/main/aider/repomap.py

import re

from composio.tools.local.base.utils.parser import filename_to_lang


class TreeContext:
    def __init__(
        self,
        filename,  # Name of the file being processed
        code,  # Content of the file as a string
        color=False,  # Whether to use color highlighting in the output
        verbose=False,  # Whether to include additional detailed information in the output
        line_number=False,  # Whether to display line numbers in the output
        parent_context=True,  # Whether to include the enclosing scope (e.g., class or function) of a match
        child_context=True,  # Whether to include nested scopes (e.g., inner functions or classes) of a match
        last_line=True,  # Whether to include the closing line of each scope (e.g., end of function or class)
        margin=3,  # Number of additional lines to include before and after matches for context
        mark_lois=True,  # Whether to highlight or mark the specific lines of interest within matches
        header_max=10,  # Maximum number of lines to include when showing the header/beginning of a scope
        show_top_of_file_parent_scope=True,  # Whether to display the top-level scope of the file (e.g., module-level code)
        loi_pad=1,  # Number of extra lines to include around specifically marked lines of interest
    ):
        # Initialize TreeContext with various parameters
        self.filename = filename
        self.color = color
        self.verbose = verbose
        self.line_number = line_number
        self.last_line = last_line
        self.margin = margin
        self.mark_lois = mark_lois
        self.header_max = header_max
        self.loi_pad = loi_pad
        self.show_top_of_file_parent_scope = show_top_of_file_parent_scope
        self.done_parent_scopes = set()
        self.parent_context = parent_context
        self.child_context = child_context

        # Determine the language of the file
        lang = filename_to_lang(filename)

        from tree_sitter_languages import get_parser  # pylint: disable=C0415

        # Get parser based on file extension
        parser = get_parser(lang)
        tree = parser.parse(bytes(code, "utf8"))

        # Split the code into lines
        self.lines = code.splitlines()
        self.num_lines = len(self.lines) + 1

        # Initialize data structures for storing information about the code
        self.output_lines = {}  # color lines, with highlighted matches
        self.scopes = [
            set() for _ in range(self.num_lines)
        ]  # Which scopes is each line part of?
        self.header = [
            [] for _ in range(self.num_lines)
        ]  # Which lines serve as a short "header" for the scope starting on that line
        self.nodes = [[] for _ in range(self.num_lines)]

        # Walk the AST tree
        root_node = tree.root_node
        self.walk_tree(root_node)
        scope_width = 0
        # Process headers and scopes
        if self.verbose:
            scope_width = max(
                len(str(set(self.scopes[i]))) for i in range(self.num_lines - 1)
            )
        for i in range(self.num_lines):
            header = sorted(self.header[i])
            if self.verbose and i < self.num_lines - 1:
                scopes = str(sorted(set(self.scopes[i])))
                print(f"{scopes.ljust(scope_width)}", i, self.lines[i])

            if len(header) > 1:
                size, head_start, head_end = header[0]
                if size > self.header_max:
                    head_end = head_start + self.header_max
            else:
                head_start = i
                head_end = i + 1

            self.header[i] = head_start, head_end

        # Initialize sets for tracking lines to show and lines of interest
        self.show_lines = set()
        self.lines_of_interest = set()

    def grep(self, pat, ignore_case):
        # Search for pattern in lines and highlight matches if color is enabled
        found = set()

        # Compile the regex pattern once before the loop
        flags = re.IGNORECASE if ignore_case else 0
        compiled_pat = re.compile(pat, flags)

        for i, line in enumerate(self.lines):
            if compiled_pat.search(line):
                if self.color:
                    highlighted_line = compiled_pat.sub(
                        lambda match: f"\033[1;31m{match.group()}\033[0m", line
                    )
                    self.output_lines[i] = highlighted_line
                found.add(i)
        return found

    def add_lines_of_interest(self, line_nums):
        # Add lines of interest to the set
        self.lines_of_interest.update(line_nums)

    def add_context(self):
        # Add context around lines of interest
        if not self.lines_of_interest:
            return

        self.done_parent_scopes = set()

        self.show_lines = set(self.lines_of_interest)

        # Add padding around lines of interest
        if self.loi_pad:
            for line in self.show_lines.copy():
                new_lines = range(
                    max(0, line - self.loi_pad),
                    min(self.num_lines, line + self.loi_pad + 1),
                )
                self.show_lines.update(new_lines)

        # Add the bottom line and its parent context if required
        if self.last_line:
            bottom_line = self.num_lines - 2
            self.show_lines.add(bottom_line)
            self.add_parent_scopes(bottom_line)

        # Add parent context for lines of interest if required
        if self.parent_context:
            for i in set(self.lines_of_interest):
                self.add_parent_scopes(i)

        # Add child context for lines of interest if required
        if self.child_context:
            for i in set(self.lines_of_interest):
                self.add_child_context(i)

        # Add top margin lines
        if self.margin:
            self.show_lines.update(range(self.margin))

        # Close small gaps between shown lines
        self.close_small_gaps()

    def add_child_context(self, i):
        # Add context for child nodes
        if not self.nodes[i]:
            return

        last_line = self.get_last_line_of_scope(i)
        size = last_line - i
        if size < 5:
            self.show_lines.update(range(i, last_line + 1))
            return

        children = []
        for node in self.nodes[i]:
            children += self.find_all_children(node)

        children = sorted(
            children,
            key=lambda node: node.end_point[0] - node.start_point[0],
            reverse=True,
        )

        currently_showing = len(self.show_lines)
        max_to_show = 25
        min_to_show = 5
        percent_to_show = 0.10
        max_to_show = max(min(size * percent_to_show, max_to_show), min_to_show)

        for child in children:
            if len(self.show_lines) > currently_showing + max_to_show:
                break
            child_start_line = child.start_point[0]
            self.add_parent_scopes(child_start_line)

    def find_all_children(self, node):
        # Recursively find all children of a node
        children = [node]
        for child in node.children:
            children += self.find_all_children(child)
        return children

    def get_last_line_of_scope(self, i):
        # Get the last line of the scope starting at line i
        last_line = max(node.end_point[0] for node in self.nodes[i])
        return last_line

    def close_small_gaps(self):
        # Close small gaps between shown lines
        closed_show = set(self.show_lines)
        sorted_show = sorted(self.show_lines)
        for i in range(len(sorted_show) - 1):
            if sorted_show[i + 1] - sorted_show[i] == 2:
                closed_show.add(sorted_show[i] + 1)

        # Pick up adjacent blank lines
        for i, _ in enumerate(self.lines):
            if i not in closed_show:
                continue
            if (
                self.lines[i].strip()
                and i < self.num_lines - 2
                and not self.lines[i + 1].strip()
            ):
                closed_show.add(i + 1)

        self.show_lines = closed_show

    def format(self):
        # Format the output with line numbers, colors, and markers
        if not self.show_lines:
            return ""

        output = ""
        if self.color:
            # reset
            output += "\033[0m\n"

        dots = not (0 in self.show_lines)
        for i, line in enumerate(self.lines):
            if i not in self.show_lines:
                if dots:
                    if self.line_number:
                        output += "...⋮...\n"
                    else:
                        output += "⋮...\n"
                    dots = False
                continue

            if i in self.lines_of_interest and self.mark_lois:
                spacer = "█"
                if self.color:
                    spacer = f"\033[31m{spacer}\033[0m"
            else:
                spacer = "│"

            line_output = f"{spacer}{self.output_lines.get(i, line)}"
            if self.line_number:
                line_output = f"{i + 1:3}" + line_output
            output += line_output + "\n"

            dots = True

        return output

    def add_parent_scopes(self, i):
        # Add parent scopes for a given line
        if i in self.done_parent_scopes:
            return
        self.done_parent_scopes.add(i)

        for line_num in self.scopes[i]:
            head_start, head_end = self.header[line_num]
            if head_start > 0 or self.show_top_of_file_parent_scope:
                self.show_lines.update(range(head_start, head_end))

            if self.last_line:
                last_line = self.get_last_line_of_scope(line_num)
                self.add_parent_scopes(last_line)

    def walk_tree(self, node, depth=0):
        # Recursively walk the AST tree and populate data structures
        start = node.start_point
        end = node.end_point

        start_line = start[0]
        end_line = end[0]
        size = end_line - start_line

        self.nodes[start_line].append(node)

        if self.verbose and node.is_named:
            print(
                "   " * depth,
                node.type,
                f"{start_line}-{end_line}={size + 1}",
                node.text.splitlines()[0],
                self.lines[start_line],
            )

        if size:
            self.header[start_line].append((size, start_line, end_line))

        for i in range(start_line, end_line + 1):
            self.scopes[i].add(start_line)

        for child in node.children:
            self.walk_tree(child, depth + 1)

        return start_line, end_line
