import base64
import platform
import re
import shlex
import shutil
import subprocess
import time
import typing as t
from enum import Enum
from pathlib import Path
from typing import Dict, TypedDict
from uuid import uuid4

from pydantic import BaseModel, Field

from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.base.local import LocalAction


class ActionType(Enum):
    KEY = "key"
    TYPE = "type"
    MOUSE_MOVE = "mouse_move"
    LEFT_CLICK = "left_click"
    LEFT_CLICK_DRAG = "left_click_drag"
    RIGHT_CLICK = "right_click"
    MIDDLE_CLICK = "middle_click"
    DOUBLE_CLICK = "double_click"
    SCREENSHOT = "screenshot"
    CURSOR_POSITION = "cursor_position"


class Resolution(TypedDict):
    width: int
    height: int


MAX_SCALING_TARGETS: dict[str, Resolution] = {
    "XGA": Resolution(width=1024, height=768),  # 4:3
    "WXGA": Resolution(width=1280, height=800),  # 16:10
    "FWXGA": Resolution(width=1366, height=768),  # ~16:9
}


class ScalingSource(str, Enum):
    API = "api"
    COMPUTER = "computer"


class ComputerRequest(BaseModel):
    action: ActionType = Field(
        ...,
        description="The action to perform on the computer",
    )
    text: t.Optional[str] = Field(
        default=None,
        description="Text to type or key sequence to press",
    )
    coordinate: t.Optional[tuple[int, int]] = Field(
        default=None,
        description="X,Y coordinates for mouse actions",
    )


class ComputerResponse(BaseModel):
    response_data: str = Field(
        ...,
        description="Result after executing the action",
    )
    base64_image: t.Optional[str] = Field(
        None,
        description="Base64 encoded screenshot if applicable",
    )


class Computer(LocalAction[ComputerRequest, ComputerResponse]):
    """
    A tool that allows interaction with the screen, keyboard, and mouse of the current computer.
    Adapted for macOS and Linux.
    """

    _tags = ["computer", "mouse", "keyboard", "screenshot"]
    _screenshot_delay = 2.0
    _scaling_enabled = True
    _typing_delay_ms = 12
    _typing_group_size = 50

    def __init__(self):
        super().__init__()
        self.os = platform.system()
        self.width, self.height = self.get_screen_size()
        self.mouse_tool = self._get_mouse_tool()
        self.screenshot_tool = self._get_screenshot_tool()

    def _get_mouse_tool(self):
        if self.os == "Darwin":
            return shutil.which("cliclick")
        if self.os == "Linux":
            return shutil.which("xdotool")
        raise NotImplementedError(f"Unsupported OS: {self.os}")

    def _get_screenshot_tool(self):
        if self.os == "Darwin":
            return "screencapture"
        if self.os == "Linux":
            return "import"
        raise NotImplementedError(f"Unsupported OS: {self.os}")

    def execute(self, request: ComputerRequest, metadata: Dict) -> ComputerResponse:
        act = request.action.value
        if act in ("mouse_move", "left_click_drag"):
            if request.coordinate is None:
                raise ValueError(f"coordinate is required for {act}")

            x, y = self.scale_coordinates(ScalingSource.API, *request.coordinate)
            if act == "mouse_move":
                cmd = self._get_mouse_move_cmd(x, y)
            else:
                current_x, current_y = self.get_mouse_position()
                cmd = self._get_mouse_drag_cmd(int(current_x), int(current_y), x, y)

            result = self.shell(cmd)
            return ComputerResponse(
                response_data=result.response_data or "",
                base64_image=result.base64_image,
            )

        if act in ("key", "type"):
            if request.text is None:
                raise ExecutionFailed(message=f"Text is required for {act}")

            if request.coordinate is not None:
                raise ExecutionFailed(
                    message=(
                        f"coordinate is not accepted for {act}, "
                        f"if you want to perform this action at {request.coordinate} "
                        "use mouse_move and right_click to move the cursor."
                    )
                )

            if act == "key":
                key_sequence = self.map_keys(request.text)
                cmd = self._get_key_press_cmd(key_sequence)
                return self.shell(cmd)

            results = []
            for chunk in self.chunks(request.text, self._typing_group_size):
                cmd = f"{self.mouse_tool} -w {self._typing_delay_ms} t:{shlex.quote(chunk)}"
                results.append(self.shell(cmd, take_screenshot=False))

            return ComputerResponse(
                response_data="".join(r.response_data or "" for r in results),
                base64_image=self.screenshot().base64_image,
            )

        if act in (
            "left_click",
            "right_click",
            "double_click",
            "middle_click",
            "screenshot",
            "cursor_position",
        ):
            if request.coordinate is not None:
                raise ExecutionFailed(
                    message=(
                        f"coordinate is not accepted for {act}, "
                        f"if you want to perform this action at {request.coordinate} "
                        "use mouse_move and right_click to move the cursor."
                    )
                )

            if act == "screenshot":
                result = self.screenshot()
                return ComputerResponse(
                    response_data="Screenshot taken",
                    base64_image=result.base64_image,
                )

            if act == "cursor_position":
                x, y = self.get_mouse_position()
                x, y = self.scale_coordinates(ScalingSource.COMPUTER, int(x), int(y))
                return ComputerResponse(
                    response_data=f"X={x},Y={y}",
                    base64_image=None,
                )

            cmd = self._get_click_cmd(act)
            result = self.shell(cmd)
            return ComputerResponse(
                response_data=result.response_data or "",
                base64_image=result.base64_image,
            )

        raise ValueError(f"Invalid action: {act}")

    def get_screen_size(self):
        """Get the screen size using OS-specific commands."""
        try:
            if self.os == "Darwin":
                cmd = "system_profiler SPDisplaysDataType | grep Resolution"
                output = subprocess.check_output(cmd, shell=True).decode()
                (resolution_line, *_) = output.strip().split("\n", maxsplit=1)
                _, resolution = resolution_line.split(": ", 1)
                match = re.search(r"(\d+)\s*x\s*(\d+)", resolution)
                if match:
                    width_str, height_str = match.groups()
                    return int(width_str), int(height_str)
            elif self.os == "Linux":

                output = subprocess.check_output(["xrandr"]).decode()
                for line in output.split("\n"):
                    if " connected" in line:
                        mode = line.split()[-1]
                        width, height = map(int, mode.split("x"))
                        return width, height

            # If we reach here, we couldn't get the screen size
            raise ValueError("Could not determine screen size")
        except Exception as e:
            print(f"Error getting screen size: {e}")
            return 1920, 1080  # Return a default resolution

    def get_mouse_position(self):
        """Get current mouse position using pyautogui."""
        import pyautogui  # pylint: disable=import-outside-toplevel

        x, y = pyautogui.position()
        return x, y

    def _get_mouse_move_cmd(self, x: int, y: int) -> str:
        if self.os == "Darwin":
            return f"{self.mouse_tool} m:{x},{y}"
        if self.os == "Linux":
            return f"xdotool mousemove {x} {y}"
        raise NotImplementedError(f"Unsupported OS: {self.os}")

    def _get_mouse_drag_cmd(
        self,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
    ) -> str:
        if self.os == "Darwin":
            return f"{self.mouse_tool} dd:{start_x},{start_y} du:{end_x},{end_y}"
        if self.os == "Linux":
            return f"xdotool mousemove {start_x} {start_y} mousedown 1 mousemove {end_x} {end_y} mouseup 1"
        raise NotImplementedError(f"Unsupported OS: {self.os}")

    def _get_key_press_cmd(self, key_sequence: str) -> str:
        if self.os == "Darwin":
            return f"{self.mouse_tool} kp:{key_sequence}"
        if self.os == "Linux":
            return f"xdotool key {key_sequence}"
        raise NotImplementedError(f"Unsupported OS: {self.os}")

    def _get_click_cmd(self, action: str) -> str:
        if self.os == "Darwin":
            click_arg = {
                "left_click": "c:.",
                "right_click": "rc:.",
                "middle_click": "mc:.",
                "double_click": "dc:.",
            }[action]
            return f"{self.mouse_tool} {click_arg}"

        if self.os == "Linux":
            click_arg = {
                "left_click": "click 1",
                "right_click": "click 3",
                "middle_click": "click 2",
                "double_click": "click --repeat 2 1",
            }[action]
            return f"xdotool {click_arg}"

        raise NotImplementedError(f"Unsupported OS: {self.os}")

    def scale_coordinates(self, source: ScalingSource, x: int, y: int):
        """Scale coordinates to a target maximum resolution."""
        if not self._scaling_enabled:
            return x, y
        ratio = self.width / self.height
        target_dimension = None
        for dimension in MAX_SCALING_TARGETS.values():
            if abs(dimension["width"] / dimension["height"] - ratio) < 0.02:
                if dimension["width"] < self.width:
                    target_dimension = dimension
                break
        if target_dimension is None:
            return x, y

        x_scaling_factor = target_dimension["width"] / self.width
        y_scaling_factor = target_dimension["height"] / self.height

        if source == ScalingSource.API:
            if x > self.width or y > self.height:
                raise ValueError(f"Coordinates {x}, {y} are out of bounds")
            return round(x / x_scaling_factor), round(y / y_scaling_factor)
        return round(x * x_scaling_factor), round(y * y_scaling_factor)

    def map_keys(self, text: str):
        """Map text to cliclick key codes if necessary."""
        return text

    @staticmethod
    def chunks(s: str, chunk_size: int) -> list[str]:
        """Split string into chunks of specified size."""
        return [
            s[i : i + chunk_size] for i in range(0, len(s), chunk_size)  # noqa: E203
        ]

    def screenshot(self):
        """Take a screenshot and return base64 encoded image."""
        output_dir = Path("/tmp/outputs")
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / f"screenshot_{uuid4().hex}.png"
        if self.os == "Darwin":
            screenshot_cmd = f"screencapture -x {path}"
        elif self.os == "Linux":
            screenshot_cmd = f"import -window root {path}"
        else:
            raise NotImplementedError(f"Unsupported OS: {self.os}")

        result = self.shell(screenshot_cmd, take_screenshot=False)
        if path.exists():
            base64_image = base64.b64encode(path.read_bytes()).decode()
            return ComputerResponse(
                response_data="Screenshot taken",
                base64_image=base64_image,
            )
        raise ValueError(f"Failed to take screenshot: {result.response_data}")

    def shell(self, command: str, take_screenshot=True):
        """Run shell command and return result with optional screenshot."""
        proc = subprocess.run(
            shlex.split(command),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        base64_image = None
        if take_screenshot:
            time.sleep(self._screenshot_delay)
            screenshot = self.screenshot()
            base64_image = screenshot.base64_image

        return ComputerResponse(
            response_data=proc.stdout.decode() + proc.stderr.decode(),
            base64_image=base64_image,
        )
