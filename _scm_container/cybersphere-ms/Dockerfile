FROM jnj.artifactrepo.jnj.com/node:18.4.0-slim
 
ARG JNJ_NODE_REPO_PASSWORD
ARG JNJ_NODE_REPO_USERNAME
ARG JNJ_NODE_REPO_EMAIL

ENV JNJ_NODE_REPO_EMAIL=$JNJ_NODE_REPO_EMAIL
ENV JNJ_NODE_REPO_USERNAME=$JNJ_NODE_REPO_USERNAME
ENV JNJ_NODE_REPO_PASSWORD=$JNJ_NODE_REPO_PASSWORD

# set up creds for private npm repo
RUN export ENCODED_PASSWORD=`echo -n "${JNJ_NODE_REPO_PASSWORD}" | base64` && \
    echo "@jnj:registry=https://artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/" > .npmrc && \
    echo "//artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/:_password=${ENCODED_PASSWORD}" >> .npmrc && \
    echo "//artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/:username=`echo ${JNJ_NODE_REPO_USERNAME}`" >> .npmrc && \
    echo "//artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/:email=${JNJ_NODE_REPO_EMAIL}" >> .npmrc && \
    echo "//artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/:always-auth=true" >> .npmrc

# Add a new user "riseadm" 
RUN adduser --disabled-password --gecos '' riseadm
RUN adduser riseadm sudo
RUN echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers


# Define the working directory
WORKDIR /app

# Copy package json file
COPY package.json .

# Put all files in the current directory into the workdir of the image
COPY . .

# Change ownership for app folder to "riseadm"
RUN chown -R riseadm:riseadm /app
RUN chmod -R 755 /app


# Switch to "riseadm" user
USER riseadm
# Install node dependencies
RUN npm ci
RUN npm run build
EXPOSE 3006

# The command the container will run
CMD npm run server

ARG JNJ_NODE_REPO_PASSWORD
ARG JNJ_NODE_REPO_USERNAME
ARG JNJ_NODE_REPO_EMAIL
 
ENV JNJ_NODE_REPO_EMAIL=$JNJ_NODE_REPO_EMAIL
ENV JNJ_NODE_REPO_USERNAME=$JNJ_NODE_REPO_USERNAME
ENV JNJ_NODE_REPO_PASSWORD=$JNJ_NODE_REPO_PASSWORD
 
# set up creds for private npm repo
RUN export ENCODED_PASSWORD=`echo -n "${JNJ_NODE_REPO_PASSWORD}" | base64` && \
    echo "@jnj:registry=https://artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/" > .npmrc && \
    echo "//artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/:_password=${ENCODED_PASSWORD}" >> .npmrc && \
    echo "//artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/:username=`echo ${JNJ_NODE_REPO_USERNAME}`" >> .npmrc && \
    echo "//artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/:email=${JNJ_NODE_REPO_EMAIL}" >> .npmrc && \
    echo "//artifactrepo.jnj.com/artifactory/api/npm/javz-npm-libs/:always-auth=true" >> .npmrc