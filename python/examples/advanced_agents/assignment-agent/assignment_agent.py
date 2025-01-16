from autogen import AssistantAgent, UserProxyAgent
from composio_autogen import ComposioToolSet, Action
from composio import AppType
import os
from dotenv import load_dotenv

load_dotenv()

toolset = ComposioToolSet(
    api_key=os.getenv("COMPOSIO_API_KEY"),
    entity_id="karthik",
)
llm_config = {
    "config_list": [
        {
            "model": "gpt-4o",
            "api_key": os.getenv("OPENAI_API_KEY"),
        }
    ]
}

chatbot = AssistantAgent(
    "chatbot",
    system_message="You're a helpful assistant that creates assignments for a course & reviews them. You will be given the details of the assigment to create and review, after creating or reviewing you need to TERMINATE.",
    llm_config=llm_config,
)

user_proxy = UserProxyAgent(
    name="User",
    is_termination_msg=lambda x: x.get("content", "")
    and "TERMINATE" in x.get("content", ""),
    human_input_mode="NEVER",
    code_execution_config={"use_docker": False},
)

toolset.register_tools(
    actions=[
        Action.CANVAS_CREATE_ASSIGNMENT,
        Action.CANVAS_GET_ASSIGNMENT,
        Action.CANVAS_LIST_ASSIGNMENT_SUBMISSIONS,
        Action.CANVAS_GRADE_COMMENT_SUBMISSION,
    ],
    caller=chatbot,
    executor=user_proxy,
)

def get_courses():
    courses = toolset.execute_action(
        action=Action.CANVAS_LIST_COURSES,
        entity_id="karthik",
        params={}
    )
    return courses

def get_assignments(course_id):
    assignments = toolset.execute_action(
        action=Action.CANVAS_GET_ALL_ASSIGNMENTS,
        entity_id="karthik",
        params={"course_id": course_id}
    )
    return assignments

def get_course_id_by_name():
    courses_response = get_courses()
    if not courses_response.get('successfull'):
        print("Failed to fetch courses")
        return None
    
    courses_data = courses_response['data']['response_data']
    available_courses = {course['name'].strip(): course['id'] for course in courses_data}
    
    print("\nAvailable courses:")
    for course_name in available_courses.keys():
        print(f"- {course_name}")
    
    while True:
        course_name = input("\nEnter course name: ").strip()
        if course_name in available_courses:
            return available_courses[course_name]
        print(f"Course '{course_name}' not found. Please try again.")

def get_create_assignment_task():
    course_id = get_course_id_by_name()
    if not course_id:
        return None
    
    name = input("\nEnter assignment name: ").strip()
    description = input("Enter assignment description: ")
    
    return f"""
    Create a new assignment for the course with id {course_id}.
    Assignment details:
    - Name: {name}
    - Description: {description}
    - Published: True
    - Assignment Group: everyone
    - Submission Types: Online (Text Entry)
    - Display grade as: Points (10 is total points)
"""

def get_assignment_id_by_name(course_id):
    assignments_response = get_assignments(course_id)
    if not assignments_response.get('successfull'):
        print("Failed to fetch assignments")
        return None
    
    assignments_data = assignments_response['data']['response_data']
    available_assignments = {assignment['name'].strip(): assignment['id'] for assignment in assignments_data}
    
    if not available_assignments:
        print("No assignments found in this course")
        return None
    
    print("\nAvailable assignments:")
    for assignment_name in available_assignments.keys():
        print(f"- {assignment_name}")
    
    while True:
        assignment_name = input("\nEnter assignment name: ").strip()
        if assignment_name in available_assignments:
            return available_assignments[assignment_name]
        print(f"Assignment '{assignment_name}' not found. Please try again.")

def get_review_assignment_task():
    course_id = get_course_id_by_name()
    if not course_id:
        return None
        
    assignment_id = get_assignment_id_by_name(course_id)
    if not assignment_id:
        return None
    
    return f"""
    You need to review the submissions for an assignment:
    1. First get the assignent details using: CANVAS_GET_ASSIGNMENT
    2. Then get the submissions for the assignment using: CANVAS_LIST_ASSIGNMENT_SUBMISSIONS
    3. Based on the assignment details, review the submissions, check if they are correct
        a. If all answers are correct, give full points (10)
        b. If one or more answers are incorrect, give partial points (5)
        c. If all answers are incorrect, give 0 points
        and grade the submissions using: CANVAS_GRADE_COMMENT_SUBMISSION
    Below are the details of the assignment:
    - Course ID: {course_id}
    - Assignment ID: {assignment_id}
"""

def main():
    print("What would you like to do?")
    print("1. Create new assignment")
    print("2. Review an assignment")
    
    choice = input("Enter your choice (1 or 2): ")
    
    if choice == "1":
        task = get_create_assignment_task()
    elif choice == "2":
        task = get_review_assignment_task()
    else:
        print("Invalid choice. Please select 1 or 2.")
        return
    
    if task:
        response = user_proxy.initiate_chat(chatbot, message=task)
        print(response.chat_history)

if __name__ == "__main__":
    main()
