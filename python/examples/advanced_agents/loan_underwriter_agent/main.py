import streamlit as st
import os
from google import genai
from composio_gemini import ComposioToolSet, App, Action
from dotenv import load_dotenv
from google.genai import types

def initialize_ai():
    load_dotenv()
    toolset = ComposioToolSet()
    tools = toolset.get_tools(actions=[
        Action.GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN
    ])
    
    config = types.GenerateContentConfig(tools=tools) # type: ignore
    client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
    return client, config

def evaluate_loan_application(data, client, config):
    prompt = f"""
    Analyze this business loan application:
    Business Name: {data['business_name']}
    Industry: {data['industry']}
    Years in Operation: {data['years_in_operation']}
    Annual Revenue: ${data['annual_revenue']:,}
    Credit Score: {data['credit_score']}
    Loan Amount Requested: ${data['loan_amount']:,}
    Current Outstanding Debt: ${data['current_debt']:,}
    
    Provide a detailed evaluation including:
    1. Loan eligibility (Yes/No)
    2. Risk assessment
    3. Recommended loan terms if eligible
    4. Industry-specific insights
    5. Decide if the plan is approved or not, depending on that create a Detailed 30-50 day actionable plan in Google Docs:
       - If approved: Create a structured repayment strategy that optimizes cash flow
       - If not approved: Outline specific steps to improve the application for approval
       
    For the action plan, include:
    - Week-by-week breakdown of tasks
    - Specific metrics to track
    - Potential challenges and solutions
    - Resources needed
    My output should contain all the detailed analysis and also create the initial google doc using the tools available to you and provide the link to it.

    """
    
    response = client.models.generate_content(
        model='gemini-2.0-pro-exp-02-05',
        config=config,
        contents=prompt
    )
    
    return response.text

def main():
    st.set_page_config(page_title="Business Loan Underwriting AI", page_icon="💼", layout="wide")
    
    st.title("Business Loan Eligibility Checker")
    st.subheader("Powered by Composio and Gemini")
    
    client, config = initialize_ai()
    
    with st.form("loan_application"):
        col1, col2 = st.columns(2)
        
        with col1:
            business_name = st.text_input("Business Name")
            industry = st.selectbox(
                "Industry",
                ["Retail", "Technology", "Manufacturing", "Healthcare", "Food & Beverage", 
                 "Construction", "Professional Services", "Other"]
            )
            years_in_operation = st.number_input("Years in Operation", min_value=0.0, step=0.5)
            annual_revenue = st.number_input("Annual Revenue ($)", min_value=0, step=1000)
        
        with col2:
            credit_score = st.slider("Business Credit Score", 300, 850, 650)
            loan_amount = st.number_input("Desired Loan Amount ($)", min_value=0, step=1000)
            current_debt = st.number_input("Current Outstanding Debt ($)", min_value=0, step=1000)
            
        uploaded_files = st.file_uploader(
            "Upload Supporting Documents (Optional)", 
            accept_multiple_files=True,
            help="Upload financial statements, tax returns, or business plans"
        )
        
        submit_button = st.form_submit_button("Evaluate Application")
        
    if submit_button:
        if not business_name or annual_revenue == 0 or loan_amount == 0:
            st.error("Please fill in all required fields")
            return
            
        with st.spinner("Analyzing your application..."):
            application_data = {
                "business_name": business_name,
                "industry": industry,
                "years_in_operation": years_in_operation,
                "annual_revenue": annual_revenue,
                "credit_score": credit_score,
                "loan_amount": loan_amount,
                "current_debt": current_debt
            }
            
            evaluation = evaluate_loan_application(application_data, client, config)
            
            st.success("Analysis Complete!")
            st.markdown("### AI Evaluation")
            st.write(evaluation)
            
            # Add visual metrics
            metrics = st.columns(3)
            with metrics[0]:
                debt_to_revenue = (current_debt / annual_revenue) * 100 if annual_revenue > 0 else 0
                st.metric("Debt-to-Revenue Ratio", f"{debt_to_revenue:.1f}%")
            with metrics[1]:
                loan_to_revenue = (loan_amount / annual_revenue) * 100 if annual_revenue > 0 else 0
                st.metric("Loan-to-Revenue Ratio", f"{loan_to_revenue:.1f}%")
            with metrics[2]:
                st.metric("Credit Score Rating", 
                         "Excellent" if credit_score >= 750 else
                         "Good" if credit_score >= 670 else
                         "Fair" if credit_score >= 580 else
                         "Poor")

if __name__ == "__main__":
    main()