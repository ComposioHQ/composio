import asyncio
import base64
import shlex
import platform
from enum import Enum
from pathlib import Path
from typing import Dict, Literal, TypedDict
from uuid import uuid4
import pyautogui

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class Resolution(TypedDict):
    width: int
    height: int


class ScalingSource(str, Enum):
    COMPUTER = "computer"
    API = "api"


MAX_SCALING_TARGETS: dict[str, Resolution] = {
    "XGA": Resolution(width=1024, height=768),  # 4:3
    "WXGA": Resolution(width=1280, height=800),  # 16:10
    "FWXGA": Resolution(width=1366, height=768),  # ~16:9
}


class ComputerRequest(BaseModel):
    action: Literal[
        "key",
        "type", 
        "mouse_move",
        "left_click",
        "left_click_drag",
        "right_click",
        "middle_click", 
        "double_click",
        "screenshot",
        "cursor_position"
    ] = Field(
        ...,
        description="The action to perform on the computer"
    )
    text: str | None = Field(
        default=None,
        description="Text to type or key sequence to press"
    )
    coordinate: tuple[int, int] | None = Field(
        default=None,
        description="X,Y coordinates for mouse actions"
    )


class ComputerResponse(BaseModel):
    execution_details: dict = Field(..., description="Execution details")
    response_data: str = Field(..., description="Result after executing the action")
    base64_image: str | None = Field(None, description="Base64 encoded screenshot if applicable")


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
            return "cliclick"
        elif self.os == "Linux":
            return "xdotool"
        else:
            raise NotImplementedError(f"Unsupported OS: {self.os}")

    def _get_screenshot_tool(self):
        if self.os == "Darwin":
            return "screencapture"
        elif self.os == "Linux":
            return "import"
        else:
            raise NotImplementedError(f"Unsupported OS: {self.os}")

    async def execute(self, request: ComputerRequest, metadata: Dict) -> ComputerResponse:
        try:
            if request.action in ("mouse_move", "left_click_drag"):
                if request.coordinate is None:
                    raise ValueError(f"coordinate is required for {request.action}")
                if request.text is not None:
                    raise ValueError(f"text is not accepted for {request.action}")
                
                x, y = self.scale_coordinates(ScalingSource.API, *request.coordinate)
                
                if request.action == "mouse_move":
                    cmd = self._get_mouse_move_cmd(x, y)
                else:
                    current_x, current_y = self.get_mouse_position()
                    cmd = self._get_mouse_drag_cmd(int(current_x), int(current_y), x, y)
                
                result = await self.shell(cmd)
                return ComputerResponse(
                    execution_details={"executed": True},
                    response_data=result.response_data or "",
                    base64_image=result.base64_image
                )

            elif request.action in ("key", "type"):
                if request.text is None:
                    raise ValueError(f"text is required for {request.action}")
                if request.coordinate is not None:
                    raise ValueError(f"coordinate is not accepted for {request.action}")

                if request.action == "key":
                    key_sequence = self.map_keys(request.text)
                    cmd = self._get_key_press_cmd(key_sequence)
                    result = await self.shell(cmd)
                else:
                    results = []
                    for chunk in self.chunks(request.text, self._typing_group_size):
                        cmd = f"{self.mouse_tool} -w {self._typing_delay_ms} t:{shlex.quote(chunk)}"
                        results.append(await self.shell(cmd, take_screenshot=False))
                    
                    screenshot = await self.screenshot()
                    return ComputerResponse(
                        execution_details={"executed": True},
                        response_data="".join(r.response_data or "" for r in results),
                        base64_image=screenshot.base64_image
                    )

            elif request.action in ("left_click", "right_click", "double_click", "middle_click", "screenshot", "cursor_position"):
                if request.text is not None or request.coordinate is not None:
                    raise ValueError(f"No parameters accepted for {request.action}")

                if request.action == "screenshot":
                    result = await self.screenshot()
                    return ComputerResponse(
                        execution_details={"executed": True},
                        response_data="Screenshot taken",
                        base64_image=result.base64_image
                    )
                elif request.action == "cursor_position":
                    x, y = self.get_mouse_position()
                    x, y = self.scale_coordinates(ScalingSource.COMPUTER, int(x), int(y))
                    return ComputerResponse(
                        execution_details={"executed": True},
                        response_data=f"X={x},Y={y}",
                        base64_image=None
                    )
                else:
                    cmd = self._get_click_cmd(request.action)
                    result = await self.shell(cmd)
                    return ComputerResponse(
                        execution_details={"executed": True},
                        response_data=result.response_data or "",
                        base64_image=result.base64_image
                    )

            raise ValueError(f"Invalid action: {request.action}")

        except Exception as e:
            return ComputerResponse(
                execution_details={"executed": False, "error": str(e)},
                response_data=f"Error: {str(e)}",
                base64_image=None
            )

    def get_screen_size(self):
        """Get the screen size using OS-specific commands."""
        try:
            if self.os == "Darwin":
                import subprocess
                import re

                cmd = "system_profiler SPDisplaysDataType | grep Resolution"
                output = subprocess.check_output(cmd, shell=True).decode()
                resolution_line = output.strip().split('\n')[0]
                _, resolution = resolution_line.split(': ', 1)
                match = re.search(r'(\d+)\s*x\s*(\d+)', resolution)
                if match:
                    width_str, height_str = match.groups()
                    return int(width_str), int(height_str)
            elif self.os == "Linux":
                import subprocess
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
        x, y = pyautogui.position()
        return x, y

    def _get_mouse_move_cmd(self, x: int, y: int) -> str:
        if self.os == "Darwin":
            return f"cliclick m:{x},{y}"
        elif self.os == "Linux":
            return f"xdotool mousemove {x} {y}"
        else:
            raise NotImplementedError(f"Unsupported OS: {self.os}")

    def _get_mouse_drag_cmd(self, start_x: int, start_y: int, end_x: int, end_y: int) -> str:
        if self.os == "Darwin":
            return f"cliclick dd:{start_x},{start_y} du:{end_x},{end_y}"
        elif self.os == "Linux":
            return f"xdotool mousemove {start_x} {start_y} mousedown 1 mousemove {end_x} {end_y} mouseup 1"
        else:
            raise NotImplementedError(f"Unsupported OS: {self.os}")

    def _get_key_press_cmd(self, key_sequence: str) -> str:
        if self.os == "Darwin":
            return f"cliclick kp:{key_sequence}"
        elif self.os == "Linux":
            return f"xdotool key {key_sequence}"
        else:
            raise NotImplementedError(f"Unsupported OS: {self.os}")

    def _get_click_cmd(self, action: str) -> str:
        if self.os == "Darwin":
            click_arg = {
                "left_click": "c:.",
                "right_click": "rc:.",
                "middle_click": "mc:.",
                "double_click": "dc:.",
            }[action]
            return f"cliclick {click_arg}"
        elif self.os == "Linux":
            click_arg = {
                "left_click": "click 1",
                "right_click": "click 3",
                "middle_click": "click 2",
                "double_click": "click --repeat 2 1",
            }[action]
            return f"xdotool {click_arg}"
        else:
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
        return [s[i:i + chunk_size] for i in range(0, len(s), chunk_size)]

    async def screenshot(self):
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

        result = await self.shell(screenshot_cmd, take_screenshot=False)

        if path.exists():
            base64_image = base64.b64encode(path.read_bytes()).decode()
            return ComputerResponse(
                execution_details={"executed": True},
                response_data="Screenshot taken",
                base64_image=base64_image
            )
        raise ValueError(f"Failed to take screenshot: {result.execution_details.get('stderr', '')}")

    async def shell(self, command: str, take_screenshot=True):
        """Run shell command and return result with optional screenshot."""
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        
        base64_image = None
        if take_screenshot:
            await asyncio.sleep(self._screenshot_delay)
            screenshot = await self.screenshot()
            base64_image = screenshot.base64_image

        return ComputerResponse(
            execution_details={"executed": True},
            response_data=stdout.decode() if stdout else "",
            base64_image=base64_image
        )

