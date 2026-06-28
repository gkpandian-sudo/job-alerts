"""
LinkedIn UGC Posts API publisher.
Uses direct binary upload (not URL-based like Instagram).
"""

import os
import requests

LINKEDIN_API = 'https://api.linkedin.com/v2'


def publish(image_path: str, caption: str) -> str:
    """
    Upload image and create a LinkedIn ugcPost.

    Args:
        image_path: Local path to the PNG image file.
        caption:    Post text / commentary.

    Returns:
        LinkedIn post ID or 'unknown'.

    Requires env vars:
        LINKEDIN_ACCESS_TOKEN  — OAuth2 token with w_member_social or w_organization_social
        LINKEDIN_AUTHOR        — urn:li:organization:XXXXX or urn:li:person:XXXXX
    """
    token  = os.environ['LINKEDIN_ACCESS_TOKEN']
    author = os.environ['LINKEDIN_AUTHOR']

    headers = {
        'Authorization':             f'Bearer {token}',
        'Content-Type':              'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
    }

    # Step 1: Register image upload
    reg_body = {
        'registerUploadRequest': {
            'recipes': ['urn:li:digitalmediaRecipe:feedshare-image'],
            'owner':   author,
            'serviceRelationships': [{
                'relationshipType': 'OWNER',
                'identifier':       'urn:li:userGeneratedContent',
            }],
        }
    }
    r = requests.post(
        f'{LINKEDIN_API}/assets?action=registerUpload',
        json=reg_body, headers=headers
    )
    r.raise_for_status()
    data       = r.json()
    upload_url = data['value']['uploadMechanism'][
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ]['uploadUrl']
    asset_urn  = data['value']['asset']
    print(f'  LinkedIn asset registered: {asset_urn}')

    # Step 2: Upload image binary
    with open(image_path, 'rb') as f:
        img_data = f.read()
    upload_headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type':  'application/octet-stream',
    }
    requests.put(upload_url, data=img_data, headers=upload_headers).raise_for_status()
    print(f'  LinkedIn image uploaded ({len(img_data):,} bytes)')

    # Step 3: Create post
    post_body = {
        'author':         author,
        'lifecycleState': 'PUBLISHED',
        'specificContent': {
            'com.linkedin.ugc.ShareContent': {
                'shareCommentary':   {'text': caption},
                'shareMediaCategory': 'IMAGE',
                'media': [{
                    'status':      'READY',
                    'description': {'text': caption[:200]},
                    'media':       asset_urn,
                }],
            }
        },
        'visibility': {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        },
    }
    r = requests.post(f'{LINKEDIN_API}/ugcPosts', json=post_body, headers=headers)
    r.raise_for_status()
    post_id = r.headers.get('x-restli-id', r.json().get('id', 'unknown'))
    print(f'  LinkedIn published: {post_id}')
    return post_id
