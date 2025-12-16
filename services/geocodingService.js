const axios = require('axios');

class GeocodingService {
  constructor() {
    this.baseUrl = 'https://nominatim.openstreetmap.org/reverse';
  }

  async getAddressFromCoordinates(lat, lng) {
    try {
      console.log(`📍 Reverse geocoding coordinates: ${lat}, ${lng}`);
      
      const response = await axios.get(this.baseUrl, {
        params: {
          lat: lat,
          lon: lng,
          format: 'json',
          'accept-language': 'en',
          zoom: 18, // Higher zoom for more detailed addresses
          addressdetails: 1
        },
        timeout: 10000
      });

      if (response.data && response.data.address) {
        const address = response.data;
        const formattedAddress = this.formatAddress(response.data);
        
        console.log(`✅ Geocoding result: ${formattedAddress}`);
        return formattedAddress;
      }
      
      return 'Unknown Location';
    } catch (error) {
      console.error('❌ Reverse geocoding error:', error.message);
      return this.getFallbackAddress(lat, lng);
    }
  }

  formatAddress(data) {
    const address = data.address;
    
    // Build detailed address
    const addressParts = [];
    
    // House number and road
    if (address.house_number) {
      addressParts.push(address.house_number);
    }
    if (address.road) {
      addressParts.push(address.road);
    }
    
    // Neighborhood
    if (address.neighbourhood) {
      addressParts.push(address.neighbourhood);
    }
    
    // Suburb
    if (address.suburb) {
      addressParts.push(address.suburb);
    }
    
    // City/district
    if (address.city) {
      addressParts.push(address.city);
    } else if (address.town) {
      addressParts.push(address.town);
    } else if (address.village) {
      addressParts.push(address.village);
    }
    
    // State
    if (address.state) {
      addressParts.push(address.state);
    }
    
    // Country
    if (address.country) {
      addressParts.push(address.country);
    }

    // If we have a display name and our address is too short, use it
    if (addressParts.length <= 2 && data.display_name) {
      // Take first part of display name (most specific part)
      const parts = data.display_name.split(',');
      return parts.slice(0, 3).join(', '); // Get first 3 parts
    }

    return addressParts.length > 0 ? addressParts.join(', ') : data.display_name || 'Unknown Location';
  }

  getFallbackAddress(lat, lng) {
    // Return coordinates if geocoding fails
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  async getCoordinatesFromAddress(address) {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: address,
          format: 'json',
          limit: 1,
          'accept-language': 'en'
        }
      });

      if (response.data && response.data.length > 0) {
        return {
          lat: parseFloat(response.data[0].lat),
          lng: parseFloat(response.data[0].lon)
        };
      }
      return null;
    } catch (error) {
      console.error('Forward geocoding error:', error);
      return null;
    }
  }
}

module.exports = new GeocodingService();