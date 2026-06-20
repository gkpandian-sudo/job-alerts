@echo off
cd /d "C:\Users\USER\Downloads\01 - Job Search\job-alerts"
node daily-hunter.js >> logs\daily-hunter.log 2>&1
