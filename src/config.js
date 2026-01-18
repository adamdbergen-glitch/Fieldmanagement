// src/config.js
export const APP_CONFIG = {
  appName: "The Paving Stone Pros",
  tagline: "Job Manager",
  companyPhone: "204-555-0123", // Used in the Portal
  
  // Theme Colors (We can use these to override standard colors later)
  primaryColor: "amber", 
  
  // Feature Flags (Turn things off for cheaper plans later)
  features: {
    showSOPs: true,
    showPortal: true
  }
}