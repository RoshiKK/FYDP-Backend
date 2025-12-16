// utils/departmentAssignment.js
class DepartmentAssignment {
  static assignDepartment(incident) {
    const { category } = incident;
    
    // Simple logic - you can enhance this based on your needs
    switch (category) {
      case 'Accident':
        // For accidents, distribute between Edhi and Chippa
        return Math.random() > 0.5 ? 'Chippa Ambulance' : 'Edhi Foundation';
      
      case 'Medical':
      case 'Fire':
      case 'Other':
      default:
        return 'Edhi Foundation'; // Default to Edhi for other categories
    }
  }

  static getAvailableDepartments() {
    return ['Edhi Foundation', 'Chippa Ambulance'];
  }
}

module.exports = DepartmentAssignment;